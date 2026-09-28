import type { CheckIn, Routine, RoutineDayState } from "@liferoute/contracts";
import { addDays, maxDate } from "./date";
import { occursOn, occurrencesBetween } from "./recurrence";

/**
 * Routine day states (FR-004, review D-25):
 * - done / skipped come from a CheckIn row;
 * - unrecorded = an expected day without a row (never stored as "skipped");
 * - notExpected = the schedule does not include that day, or the routine is not active.
 * Recording on a not-expected day is allowed and shown, but aggregates count expected days only.
 */
type RoutineLike = Pick<Routine, "id" | "schedule" | "status" | "deletedAt">;
type CheckInLike = Pick<CheckIn, "routineId" | "date" | "status">;

export function isExpected(routine: RoutineLike, date: string): boolean {
  return routine.deletedAt === null && routine.status === "active" && occursOn(routine.schedule, date);
}

export function dayState(
  routine: RoutineLike,
  checkIn: CheckInLike | undefined,
  date: string,
): RoutineDayState {
  if (checkIn) return checkIn.status;
  return isExpected(routine, date) ? "unrecorded" : "notExpected";
}

export function indexCheckIns<T extends CheckInLike>(checkIns: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const c of checkIns) map.set(`${c.routineId}|${c.date}`, c);
  return map;
}

export function checkInKey(routineId: string, date: string): string {
  return `${routineId}|${date}`;
}

export interface RoutineStats {
  routineId: string;
  expected: number;
  done: number;
  skipped: number;
  unrecorded: number;
}

/**
 * Aggregates [from, to] (inclusive, not beyond `today`): only expected days count.
 * Days after `today` are not yet "unrecorded".
 */
export function routineStats(
  routine: RoutineLike,
  checkIns: ReadonlyMap<string, CheckInLike>,
  from: string,
  to: string,
): RoutineStats {
  const stats: RoutineStats = { routineId: routine.id, expected: 0, done: 0, skipped: 0, unrecorded: 0 };
  if (routine.deletedAt !== null) return stats;
  for (const date of occurrencesBetween(routine.schedule, from, to)) {
    if (routine.status !== "active") continue;
    stats.expected += 1;
    const c = checkIns.get(checkInKey(routine.id, date));
    if (!c) stats.unrecorded += 1;
    else if (c.status === "done") stats.done += 1;
    else stats.skipped += 1;
  }
  return stats;
}

/** Consecutive expected days marked done, counting back from `today` (today counts only if recorded). */
export function currentStreak(
  routine: RoutineLike,
  checkIns: ReadonlyMap<string, CheckInLike>,
  today: string,
): number {
  let streak = 0;
  if (routine.schedule.startDate > today) return 0;
  const from = maxDate(routine.schedule.startDate, addDays(today, -400));
  const dates = occurrencesBetween(routine.schedule, from, today).reverse();
  for (const [i, date] of dates.entries()) {
    const c = checkIns.get(checkInKey(routine.id, date));
    if (i === 0 && date === today && !c) continue;
    if (c?.status === "done") streak += 1;
    else break;
  }
  return streak;
}
