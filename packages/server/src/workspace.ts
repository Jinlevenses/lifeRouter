import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  CONTRACT_VERSION,
  TIMEZONE,
  type Task,
  type TodayView,
  type WorkspaceData,
} from "@liferoute/contracts";
import {
  addDays,
  computeNetWorth,
  dateInZone,
  dayState,
  indexCheckIns,
  checkInKey,
  staleTopTasks,
  startOfDayInstant,
  todayInZone,
  topTasksFor,
} from "@liferoute/core";
import { currentBudget } from "./commands/analysis";
import type { Db } from "./db/client";
import * as s from "./db/schema";
import * as m from "./mappers";
import { ensureSeeded } from "./seed";

export const WINDOW_PAST_DAYS = 60;
export const WINDOW_FUTURE_DAYS = 60;
const WORKER_STALE_MS = 3 * 60_000;

/**
 * GET /api/v1/workspace read model (review D-33): everything the UI needs in one response.
 * Heavy history is bounded by a ±60-day window; note bodies are excluded (NoteSummary only).
 */
export async function loadWorkspace(db: Db, now: Date = new Date()): Promise<WorkspaceData> {
  const today = todayInZone(TIMEZONE, now);
  await ensureSeeded(db, today);
  const from = addDays(today, -WINDOW_PAST_DAYS);
  const to = addDays(today, WINDOW_FUTURE_DAYS);
  const fromInstant = new Date(startOfDayInstant(from));
  const toInstant = new Date(startOfDayInstant(addDays(to, 1)));

  const [
    settingsRow,
    goalRows,
    projectRows,
    taskRows,
    routineRows,
    checkInRows,
    accountRows,
    snapshotRows,
    noteRows,
    linkCounts,
    backlinkCounts,
    collectionRows,
    recordRows,
    eventRows,
    proposalRows,
    inboxRows,
    receiptRows,
    reviewRows,
    analysisRows,
    connectionRows,
    guidanceRows,
    tokenRows,
    opsRows,
  ] = await Promise.all([
    db.select().from(s.settings).where(eq(s.settings.id, "settings")),
    db.select().from(s.goals).where(isNull(s.goals.deletedAt)).orderBy(s.goals.sortOrder),
    db.select().from(s.projects).where(isNull(s.projects.deletedAt)).orderBy(s.projects.sortOrder),
    db
      .select()
      .from(s.tasks)
      .where(
        and(
          isNull(s.tasks.deletedAt),
          or(eq(s.tasks.status, "open"), gte(s.tasks.updatedAt, fromInstant)),
        ),
      )
      .orderBy(s.tasks.sortOrder),
    db.select().from(s.routines).where(isNull(s.routines.deletedAt)).orderBy(s.routines.sortOrder),
    db.select().from(s.checkIns).where(and(gte(s.checkIns.date, from), lte(s.checkIns.date, today))),
    db.select().from(s.accounts).orderBy(s.accounts.sortOrder),
    db.select().from(s.balanceSnapshots).orderBy(s.balanceSnapshots.asOf),
    db
      .select({
        id: s.notes.id,
        title: s.notes.title,
        tags: s.notes.tags,
        projectId: s.notes.projectId,
        goalId: s.notes.goalId,
        text: s.notes.text,
        createdAt: s.notes.createdAt,
        updatedAt: s.notes.updatedAt,
        deletedAt: s.notes.deletedAt,
        version: s.notes.version,
      })
      .from(s.notes)
      .where(isNull(s.notes.deletedAt))
      .orderBy(desc(s.notes.updatedAt)),
    db
      .select({ id: s.noteLinks.sourceNoteId, n: sql<number>`count(*)::int` })
      .from(s.noteLinks)
      .groupBy(s.noteLinks.sourceNoteId),
    db
      .select({ id: s.noteLinks.targetId, n: sql<number>`count(*)::int` })
      .from(s.noteLinks)
      .where(eq(s.noteLinks.targetType, "note"))
      .groupBy(s.noteLinks.targetId),
    db.select().from(s.collections).where(isNull(s.collections.deletedAt)),
    db.select().from(s.collectionRecords).where(isNull(s.collectionRecords.deletedAt)).orderBy(s.collectionRecords.sortOrder),
    db
      .select()
      .from(s.calendarEvents)
      .where(
        and(
          isNull(s.calendarEvents.deletedAt),
          or(
            and(eq(s.calendarEvents.allDay, false), lte(s.calendarEvents.startAt, toInstant), gte(s.calendarEvents.endAt, fromInstant)),
            and(eq(s.calendarEvents.allDay, true), lte(s.calendarEvents.startDate, to), gte(s.calendarEvents.endDate, from)),
          ),
        ),
      ),
    db
      .select()
      .from(s.proposals)
      .where(or(inArray(s.proposals.status, ["pending", "approved", "failed"]), gte(s.proposals.updatedAt, fromInstant)))
      .orderBy(desc(s.proposals.createdAt)),
    db
      .select()
      .from(s.inboxItems)
      .where(or(eq(s.inboxItems.status, "new"), gte(s.inboxItems.updatedAt, fromInstant)))
      .orderBy(desc(s.inboxItems.capturedAt)),
    db
      .select()
      .from(s.receipts)
      .where(or(eq(s.receipts.status, "draft"), gte(s.receipts.updatedAt, fromInstant)))
      .orderBy(desc(s.receipts.createdAt)),
    db.select().from(s.reviews).orderBy(desc(s.reviews.periodStart)).limit(60),
    db.select().from(s.analyses).orderBy(desc(s.analyses.createdAt)).limit(50),
    db.select().from(s.connections),
    db.select().from(s.guidanceSources).orderBy(desc(s.guidanceSources.checkedAt)),
    db.select().from(s.apiTokens).orderBy(desc(s.apiTokens.createdAt)),
    db.select().from(s.opsState).where(inArray(s.opsState.key, ["worker.heartbeat", "backup.last"])),
  ]);

  const settings = m.toSettings(settingsRow[0]!);
  const tasks = taskRows.map(m.toTask);
  const routines = routineRows.map(m.toRoutine);
  const checkIns = checkInRows.map(m.toCheckIn);
  const accounts = accountRows.map(m.toAccount);
  const snapshots = snapshotRows.map(m.toSnapshot);
  const calendarEvents = eventRows.map(m.toCalendarEvent);
  const linkCountMap = new Map(linkCounts.map((r) => [r.id, Number(r.n)]));
  const backlinkCountMap = new Map(backlinkCounts.map((r) => [r.id, Number(r.n)]));

  const netWorth = computeNetWorth({ accounts, snapshots, today, finance: settings.finance, timeZone: TIMEZONE });
  const todayView = buildTodayView(today, tasks, routines, checkIns, calendarEvents);
  const ops = Object.fromEntries(opsRows.map((r) => [r.key, r.value])) as {
    "worker.heartbeat"?: { at: string };
    "backup.last"?: { at: string; ok: boolean };
  };

  return {
    contractVersion: CONTRACT_VERSION,
    generatedAt: now.toISOString(),
    today,
    timezone: TIMEZONE,
    window: { from, to },
    settings,
    todayView,
    goals: goalRows.map(m.toGoal),
    projects: projectRows.map(m.toProject),
    tasks,
    routines,
    checkIns,
    accounts,
    snapshots,
    netWorth,
    notes: noteRows.map((n) => m.toNoteSummary(n, linkCountMap.get(n.id) ?? 0, backlinkCountMap.get(n.id) ?? 0)),
    collections: collectionRows.map(m.toCollection),
    collectionRecords: recordRows.map(m.toRecord),
    calendarEvents,
    proposals: proposalRows.map(m.toProposal),
    inbox: inboxRows.map(m.toInboxItem),
    receipts: receiptRows.map(m.toReceipt),
    reviews: reviewRows.map(m.toReview),
    analyses: analysisRows.map(m.toAnalysis),
    aiBudget: await currentBudget(db, settings, today),
    connections: connectionRows.map(m.toConnection),
    guidance: guidanceRows.map(m.toGuidance),
    apiTokens: tokenRows.map(m.toApiToken),
    ops: {
      lastBackupAt: ops["backup.last"]?.at ?? null,
      lastBackupOk: ops["backup.last"]?.ok ?? null,
      workerAlive: ops["worker.heartbeat"] ? now.getTime() - Date.parse(ops["worker.heartbeat"].at) < WORKER_STALE_MS : false,
    },
  };
}

export function buildTodayView(
  today: string,
  tasks: readonly Task[],
  routines: WorkspaceData["routines"],
  checkIns: WorkspaceData["checkIns"],
  events: WorkspaceData["calendarEvents"],
): TodayView {
  const index = indexCheckIns(checkIns);
  const eventOnDay = (e: WorkspaceData["calendarEvents"][number]) =>
    e.status !== "cancelled" &&
    (e.when.allDay
      ? e.when.startDate <= today && e.when.endDate >= today
      : dateInZone(e.when.start, TIMEZONE) <= today && dateInZone(e.when.end, TIMEZONE) >= today);
  return {
    date: today,
    topTaskIds: topTasksFor(tasks, today).map((t) => t.id),
    plannedTaskIds: tasks
      .filter((t) => t.deletedAt === null && t.status === "open" && t.plannedAt && dateInZone(t.plannedAt, TIMEZONE) === today)
      .sort((a, b) => (a.plannedAt! < b.plannedAt! ? -1 : 1))
      .map((t) => t.id),
    calendarEventIds: events
      .filter(eventOnDay)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .map((e) => e.id),
    routines: routines
      .filter((r) => r.status === "active")
      .map((r) => {
        const c = index.get(checkInKey(r.id, today));
        return { routineId: r.id, state: dayState(r, c, today), checkInId: c?.id ?? null };
      }),
    staleTopTaskIds: staleTopTasks(tasks, today).map((t) => t.id),
  };
}

function sortKey(e: WorkspaceData["calendarEvents"][number]): string {
  return e.when.allDay ? `0${e.when.startDate}` : `1${e.when.start}`;
}
