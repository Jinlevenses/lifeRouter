import { TOP_TASKS_PER_DAY, type Recurrence, type Task, type TopRank } from "@liferoute/contracts";
import { maxDate } from "./date";
import { firstAfter } from "./recurrence";

/**
 * Planning rules (FR-002, review D-22..D-26).
 * - dueDate (DateOnly deadline) and plannedAt (Instant calendar slot) are independent.
 * - Top 3: at most three open tasks share a topDate, each with a unique rank 1..3. No auto carry-over.
 * - Recurring tasks roll: completing one creates the next occurrence strictly after max(dueDate, today).
 */
export type TopPickResult = { ok: true; rank: TopRank } | { ok: false; code: "TOP_LIMIT_EXCEEDED" | "TOP_RANK_TAKEN" };

type TopTask = Pick<Task, "id" | "status" | "topDate" | "topRank" | "deletedAt">;

function occupying(tasks: readonly TopTask[], date: string, excludeTaskId?: string): TopTask[] {
  return tasks.filter(
    (t) => t.id !== excludeTaskId && t.deletedAt === null && t.status === "open" && t.topDate === date && t.topRank !== null,
  );
}

/** Chooses a free rank for `date`, or explains why the task cannot join the day's Top 3. */
export function pickTopRank(
  tasks: readonly TopTask[],
  date: string,
  taskId: string,
  requested?: TopRank,
): TopPickResult {
  const taken = new Set(occupying(tasks, date, taskId).map((t) => t.topRank));
  if (requested !== undefined) {
    return taken.has(requested) ? { ok: false, code: "TOP_RANK_TAKEN" } : { ok: true, rank: requested };
  }
  if (taken.size >= TOP_TASKS_PER_DAY) return { ok: false, code: "TOP_LIMIT_EXCEEDED" };
  for (const rank of [1, 2, 3] as const) if (!taken.has(rank)) return { ok: true, rank };
  return { ok: false, code: "TOP_LIMIT_EXCEEDED" };
}

/** Open tasks marked for `date`, ordered by rank. */
export function topTasksFor<T extends TopTask>(tasks: readonly T[], date: string): T[] {
  return (occupying(tasks, date) as T[]).sort((a, b) => (a.topRank ?? 9) - (b.topRank ?? 9));
}

/** Open tasks whose topDate is in the past: the UI offers "오늘로 옮기기" instead of moving them silently. */
export function staleTopTasks<T extends TopTask>(tasks: readonly T[], today: string): T[] {
  return tasks.filter(
    (t) => t.deletedAt === null && t.status === "open" && t.topDate !== null && t.topDate < today,
  );
}

/**
 * Due date of the next occurrence after completing a recurring task:
 * the first occurrence strictly after max(previous dueDate, today), so missed repeats never pile up.
 * Returns null when the rule has ended.
 */
export function nextDueDate(rule: Recurrence, previousDueDate: string, today: string): string | null {
  return firstAfter(rule, maxDate(previousDueDate, today));
}

/** A task is overdue when it is open and its dueDate is before today. */
export function isOverdue(task: Pick<Task, "status" | "dueDate">, today: string): boolean {
  return task.status === "open" && task.dueDate !== null && task.dueDate < today;
}
