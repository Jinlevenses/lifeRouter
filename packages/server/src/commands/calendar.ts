import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { JOB_NAMES, type CommandPayload, type CommandResultMap, type EventWhen } from "@liferoute/contracts";
import { canTransition } from "@liferoute/core";
import { calendarEvents, connections, proposals, tasks } from "../db/schema";
import { DomainError, invalidTransition, notFound, versionConflict } from "../errors";
import { toCalendarEvent, toProposal } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

/**
 * Calendar (FR-008, ADR-003, review D-39..D-42).
 * - Local events are edited directly. Google events are read-only here.
 * - Any external write goes Proposal → owner approval → worker job, and only for managed events.
 */
export function whenColumns(when: EventWhen) {
  return when.allDay
    ? { allDay: true, startAt: null, endAt: null, startDate: when.startDate, endDate: when.endDate }
    : { allDay: false, startAt: new Date(when.start), endAt: new Date(when.end), startDate: null, endDate: null };
}

async function checkTask(ctx: CommandContext, taskId: string | null) {
  if (!taskId) return;
  const [row] = await ctx.tx.select({ d: tasks.deletedAt }).from(tasks).where(eq(tasks.id, taskId));
  if (!row || row.d) throw notFound("할 일");
}

async function lockEvent(ctx: CommandContext, eventId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).for("update");
  return assertVersion(row, expectedVersion, "calendarEvent", eventId, toCalendarEvent, "일정");
}

function useProposal(): DomainError {
  return new DomainError(
    "USE_PROPOSAL",
    "Google 캘린더 일정은 여기서 바로 바꿀 수 없습니다.",
    undefined,
    "LifeRoute가 만든 일정이라면 변경 제안을 만들어 승인하세요.",
  );
}

export async function eventCreate(ctx: CommandContext, p: P<"calendar.event.create">): R<"calendar.event.create"> {
  await checkTask(ctx, p.taskId);
  const [row] = await ctx.tx
    .insert(calendarEvents)
    .values({
      id: p.id ?? randomUUID(),
      source: "local",
      title: p.title.trim(),
      description: p.description,
      location: p.location,
      ...whenColumns(p.when),
      taskId: p.taskId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { event: toCalendarEvent(row!) };
}

export async function eventUpdate(ctx: CommandContext, p: P<"calendar.event.update">): R<"calendar.event.update"> {
  const row = await lockEvent(ctx, p.eventId, p.expectedVersion);
  if (row.source !== "local") throw useProposal();
  if (p.patch.taskId !== undefined) await checkTask(ctx, p.patch.taskId);
  const [updated] = await ctx.tx
    .update(calendarEvents)
    .set({
      ...(p.patch.title !== undefined ? { title: p.patch.title.trim() } : {}),
      ...(p.patch.description !== undefined ? { description: p.patch.description } : {}),
      ...(p.patch.location !== undefined ? { location: p.patch.location } : {}),
      ...(p.patch.when ? whenColumns(p.patch.when) : {}),
      ...(p.patch.taskId !== undefined ? { taskId: p.patch.taskId } : {}),
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(calendarEvents.id, row.id))
    .returning();
  return { event: toCalendarEvent(updated!) };
}

export async function eventDelete(ctx: CommandContext, p: P<"calendar.event.delete">): R<"calendar.event.delete"> {
  const row = await lockEvent(ctx, p.eventId, p.expectedVersion);
  if (row.source !== "local") throw useProposal();
  const [updated] = await ctx.tx
    .update(calendarEvents)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(calendarEvents.id, row.id))
    .returning();
  return { event: toCalendarEvent(updated!) };
}

async function googleConnection(ctx: CommandContext) {
  const [row] = await ctx.tx.select().from(connections).where(eq(connections.provider, "google"));
  return row;
}

function disconnected(): DomainError {
  return new DomainError(
    "INTEGRATION_DISCONNECTED",
    "Google 캘린더가 연결되어 있지 않습니다.",
    undefined,
    "설정 > 연결에서 Google 계정을 연결한 뒤 다시 승인하세요. 제안은 대기 상태로 남아 있습니다.",
  );
}

/** Update/delete proposals may target only managed events, checked against the event version. */
async function managedEvent(ctx: CommandContext, eventId: string, expectedEventVersion: number) {
  const [event] = await ctx.tx.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
  if (!event || event.deletedAt) throw notFound("일정");
  if (!event.managed || event.source !== "google") {
    throw new DomainError("NOT_MANAGED_EVENT", "LifeRoute가 만든 Google 일정만 변경을 제안할 수 있습니다.");
  }
  if (event.version !== expectedEventVersion) {
    throw versionConflict("calendarEvent", event.id, expectedEventVersion, event.version, toCalendarEvent(event));
  }
  return event;
}

export async function calendarPropose(ctx: CommandContext, p: P<"calendar.propose">): R<"calendar.propose"> {
  const base = { id: p.id ?? randomUUID(), status: "pending" as const, createdBy: "owner" as const, createdAt: ctx.now, updatedAt: ctx.now };
  let values: typeof proposals.$inferInsert;
  if (p.kind === "calendar.create") {
    await checkTask(ctx, p.taskId);
    const connection = await googleConnection(ctx);
    values = {
      ...base,
      kind: p.kind,
      draft: p.draft,
      taskId: p.taskId,
      targetCalendarId: p.targetCalendarId ?? connection?.meta.managedCalendarId ?? null,
    };
  } else {
    const event = await managedEvent(ctx, p.calendarEventId, p.expectedEventVersion);
    values = {
      ...base,
      kind: p.kind,
      calendarEventId: event.id,
      expectedEventVersion: p.expectedEventVersion,
      targetCalendarId: event.externalCalendarId,
      draft: p.kind === "calendar.update" ? p.draft : null,
    };
  }
  const [row] = await ctx.tx.insert(proposals).values(values).returning();
  return { proposal: toProposal(row!) };
}

async function lockProposal(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(proposals).where(eq(proposals.id, id)).for("update");
  return assertVersion(row, expectedVersion, "proposal", id, toProposal, "제안");
}

export async function calendarApprove(ctx: CommandContext, p: P<"calendar.approve">): R<"calendar.approve"> {
  const proposal = await lockProposal(ctx, p.proposalId, p.expectedVersion);
  if (!canTransition("proposal", proposal.status, "approved")) invalidTransitionFor(proposal.status);
  const connection = await googleConnection(ctx);
  if (!ctx.integrations.calendar.available || connection?.status !== "connected") throw disconnected();
  if (proposal.calendarEventId && proposal.expectedEventVersion !== null) {
    await managedEvent(ctx, proposal.calendarEventId, proposal.expectedEventVersion);
  }
  const [row] = await ctx.tx
    .update(proposals)
    .set({ status: "approved", decidedAt: ctx.now, error: null, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(proposals.id, proposal.id))
    .returning();
  ctx.afterCommit(async () => {
    await ctx.jobs.send(JOB_NAMES.googleApplyProposal, { proposalId: proposal.id }, { singletonKey: proposal.id });
  });
  return { proposal: toProposal(row!), jobQueued: true };
}

export async function calendarReject(ctx: CommandContext, p: P<"calendar.reject">): R<"calendar.reject"> {
  const proposal = await lockProposal(ctx, p.proposalId, p.expectedVersion);
  if (!canTransition("proposal", proposal.status, "rejected")) invalidTransitionFor(proposal.status);
  const [row] = await ctx.tx
    .update(proposals)
    .set({
      status: "rejected",
      decidedAt: ctx.now,
      error: p.reason ? `거절: ${p.reason}` : null,
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(proposals.id, proposal.id))
    .returning();
  return { proposal: toProposal(row!) };
}

function invalidTransitionFor(status: string): never {
  throw invalidTransition(`현재 상태(${status})에서는 처리할 수 없는 제안입니다.`);
}
