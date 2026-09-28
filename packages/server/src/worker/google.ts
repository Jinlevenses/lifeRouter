import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { CalendarEventDraft } from "@liferoute/contracts";
import { addDays, maxDate } from "@liferoute/core";
import type { Db } from "../db/client";
import { calendarEvents, connections, proposals } from "../db/schema";
import {
  IntegrationError,
  type CalendarProvider,
  type GoogleEvent,
  type GoogleTokens,
} from "../integrations";
import { log, maskSecrets } from "../logger";
import { openJson, sealJson } from "../ops/secret-box";

/** Google read sync and approved managed writes (review D-41/D-42). */
async function tokensFor(db: Db, provider: CalendarProvider) {
  const [conn] = await db.select().from(connections).where(eq(connections.provider, "google"));
  if (!conn || !conn.secret || conn.status === "disconnected" || conn.status === "reauth_required")
    return null;
  const stored = openJson<GoogleTokens>(conn.secret);
  const fresh = await provider.refresh(stored);
  if (fresh.accessToken !== stored.accessToken) {
    await db
      .update(connections)
      .set({ secret: sealJson(fresh), updatedAt: new Date() })
      .where(eq(connections.id, conn.id));
  }
  return { conn, tokens: fresh };
}

async function markFailure(db: Db, error: unknown) {
  const message = maskSecrets(error instanceof Error ? error.message : String(error));
  const status = error instanceof IntegrationError && error.kind === "auth" ? "reauth_required" : "failed";
  await db
    .update(connections)
    .set({
      status,
      lastError: message,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
      version: sql`version + 1`,
    })
    .where(eq(connections.provider, "google"));
}

function eventColumns(e: GoogleEvent) {
  if (e.start?.date) {
    const start = e.start.date;
    // Google's all-day end.date is exclusive; ours is inclusive.
    const end = maxDate(start, addDays(e.end?.date ?? addDays(start, 1), -1));
    return { allDay: true, startAt: null, endAt: null, startDate: start, endDate: end };
  }
  return {
    allDay: false,
    startAt: new Date(e.start?.dateTime ?? Date.now()),
    endAt: new Date(e.end?.dateTime ?? e.start?.dateTime ?? Date.now()),
    startDate: null,
    endDate: null,
  };
}

export async function googleSync(
  db: Db,
  provider: CalendarProvider,
  now = new Date(),
): Promise<{ upserted: number }> {
  if (!provider.available) return { upserted: 0 };
  const ctx = await tokensFor(db, provider).catch(async (error) => {
    await markFailure(db, error);
    return null;
  });
  if (!ctx) return { upserted: 0 };
  const { conn, tokens } = ctx;
  const calendars = [
    ...new Set([
      ...(conn.meta.calendarIds ?? []),
      ...(conn.meta.managedCalendarId ? [conn.meta.managedCalendarId] : []),
    ]),
  ];
  const syncState = { ...(conn.syncState as Record<string, string>) };
  let upserted = 0;
  try {
    for (const calendarId of calendars) {
      let result;
      try {
        result = await provider.listEvents(tokens, calendarId, {
          syncToken: syncState[calendarId],
          timeMin: new Date(now.getTime() - 60 * 86_400_000).toISOString(),
        });
      } catch (error) {
        if (error instanceof IntegrationError && error.kind === "gone") {
          delete syncState[calendarId]; // 410: full resync (Google sync guide)
          result = await provider.listEvents(tokens, calendarId, {
            timeMin: new Date(now.getTime() - 60 * 86_400_000).toISOString(),
          });
        } else throw error;
      }
      for (const e of result.events) {
        upserted += await upsertGoogleEvent(db, conn.id, calendarId, e, now);
      }
      if (result.nextSyncToken) syncState[calendarId] = result.nextSyncToken;
    }
    await db
      .update(connections)
      .set({
        status: "connected",
        syncState,
        lastSyncAt: now,
        lastSuccessAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(connections.id, conn.id));
  } catch (error) {
    log.error("google.sync_failed", error);
    await markFailure(db, error);
    throw error;
  }
  return { upserted };
}

async function upsertGoogleEvent(
  db: Db,
  connectionId: string,
  calendarId: string,
  e: GoogleEvent,
  now: Date,
): Promise<number> {
  const [existing] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.externalCalendarId, calendarId), eq(calendarEvents.externalId, e.id)));
  if (existing && existing.etag === e.etag) return 0;
  const cancelled = e.status === "cancelled";
  if (!existing && cancelled) return 0;
  if (cancelled) {
    await db
      .update(calendarEvents)
      .set({
        deletedAt: now,
        status: "cancelled",
        etag: e.etag,
        lastSyncedAt: now,
        updatedAt: now,
        version: sql`version + 1`,
      })
      .where(eq(calendarEvents.id, existing!.id));
    return 1;
  }
  const values = {
    title: e.summary ?? "(제목 없음)",
    description: e.description ?? "",
    location: e.location ?? null,
    ...eventColumns(e),
    etag: e.etag,
    managed: e.extendedProperties?.private?.["liferoute.managed"] === "true",
    status: "confirmed" as const,
    syncStatus: "synced" as const,
    lastSyncedAt: now,
    deletedAt: null,
  };
  if (existing) {
    await db
      .update(calendarEvents)
      .set({ ...values, updatedAt: now, version: sql`version + 1` })
      .where(eq(calendarEvents.id, existing.id));
  } else {
    await db
      .insert(calendarEvents)
      .values({
        id: e.extendedProperties?.private?.["liferoute.id"] ?? randomUUID(),
        source: "google",
        connectionId,
        externalCalendarId: calendarId,
        externalId: e.id,
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
  return 1;
}

/** Applies an approved proposal. Conflicts (etag mismatch) fail the proposal instead of overwriting. */
export async function applyProposal(
  db: Db,
  provider: CalendarProvider,
  proposalId: string,
  now = new Date(),
): Promise<void> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal || proposal.status !== "approved") return;
  const fail = async (message: string) => {
    await db
      .update(proposals)
      .set({
        status: "failed",
        error: maskSecrets(message),
        updatedAt: new Date(),
        version: sql`version + 1`,
      })
      .where(eq(proposals.id, proposal.id));
  };
  const ctx = await tokensFor(db, provider).catch(() => null);
  if (!ctx) return fail("Google 연결이 끊어졌습니다. 다시 연결한 뒤 재승인하세요.");
  const { conn, tokens } = ctx;
  try {
    if (proposal.kind === "calendar.create") {
      const calendarId = proposal.targetCalendarId ?? conn.meta.managedCalendarId;
      if (!calendarId) return fail("LifeRoute 전용 캘린더가 없습니다. 연결을 다시 설정하세요.");
      // Idempotent across retries/crashes: the proposal id is the event's local id, and an event
      // already carrying it in Google (inserted by an earlier attempt) is reused, never duplicated.
      const localId = proposal.id;
      const created =
        (await provider.findByLocalId(tokens, calendarId, localId)) ??
        (await provider.insertEvent(tokens, calendarId, proposal.draft as CalendarEventDraft, localId));
      const values = {
        source: "google" as const,
        connectionId: conn.id,
        externalCalendarId: calendarId,
        externalId: created.id,
        etag: created.etag,
        title: proposal.draft!.title,
        description: proposal.draft!.description,
        location: proposal.draft!.location,
        ...draftColumns(proposal.draft!),
        managed: true,
        taskId: proposal.taskId,
        syncStatus: "synced" as const,
        lastSyncedAt: now,
        updatedAt: now,
      };
      // A sync may already have imported it under the same id.
      await db
        .insert(calendarEvents)
        .values({ id: localId, ...values, createdAt: now })
        .onConflictDoUpdate({ target: calendarEvents.id, set: values });
      await db
        .update(proposals)
        .set({
          status: "applied",
          calendarEventId: localId,
          appliedAt: now,
          updatedAt: now,
          version: sql`version + 1`,
        })
        .where(eq(proposals.id, proposal.id));
      return;
    }
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, proposal.calendarEventId!));
    if (!event || !event.managed || !event.externalId || !event.externalCalendarId)
      return fail("대상 일정이 없거나 관리 대상이 아닙니다.");
    if (proposal.expectedEventVersion !== null && event.version !== proposal.expectedEventVersion) {
      return fail("승인 후 일정이 바뀌었습니다. 새로 제안하세요.");
    }
    if (proposal.kind === "calendar.update") {
      const updated = await provider.patchEvent(
        tokens,
        event.externalCalendarId,
        event.externalId,
        event.etag,
        proposal.draft!,
      );
      await db
        .update(calendarEvents)
        .set({
          title: proposal.draft!.title,
          description: proposal.draft!.description,
          location: proposal.draft!.location,
          ...draftColumns(proposal.draft!),
          etag: updated.etag,
          syncStatus: "synced",
          lastSyncedAt: now,
          updatedAt: now,
          version: sql`version + 1`,
        })
        .where(eq(calendarEvents.id, event.id));
    } else {
      await provider.deleteEvent(tokens, event.externalCalendarId, event.externalId, event.etag);
      await db
        .update(calendarEvents)
        .set({ deletedAt: now, status: "cancelled", updatedAt: now, version: sql`version + 1` })
        .where(eq(calendarEvents.id, event.id));
    }
    await db
      .update(proposals)
      .set({ status: "applied", appliedAt: now, updatedAt: now, version: sql`version + 1` })
      .where(eq(proposals.id, proposal.id));
  } catch (error) {
    if (error instanceof IntegrationError && error.kind === "conflict") {
      if (proposal.calendarEventId) {
        await db
          .update(calendarEvents)
          .set({ syncStatus: "conflict" })
          .where(eq(calendarEvents.id, proposal.calendarEventId));
      }
      return fail("Google에서 먼저 바뀐 일정입니다. 동기화 후 다시 제안하세요.");
    }
    if (error instanceof IntegrationError && error.kind === "auth") await markFailure(db, error);
    if (error instanceof IntegrationError && error.kind === "transient") throw error; // pg-boss retries
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function draftColumns(draft: CalendarEventDraft) {
  return draft.when.allDay
    ? {
        allDay: true,
        startAt: null,
        endAt: null,
        startDate: draft.when.startDate,
        endDate: draft.when.endDate,
      }
    : {
        allDay: false,
        startAt: new Date(draft.when.start),
        endAt: new Date(draft.when.end),
        startDate: null,
        endDate: null,
      };
}
