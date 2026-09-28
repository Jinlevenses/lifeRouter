import type { Recurrence, Weekday } from "@liferoute/contracts";
import { addDays, compareDate, daysInMonth, diffDays, isoWeekday, maxDate, parseDate } from "./date";

/**
 * Date-only recurrence (FR-003, docs/03_data, review D-21):
 * - daily; weekday (Mon–Fri, sugar for weekly mon..fri); weekly (named weekdays); monthly (1–31 or "last").
 * - A monthly day of 29–31 clamps to the month's last day (Jan 31 → Feb 28/29).
 * - Nothing occurs before `startDate` or after `endDate` (both inclusive).
 */
export const WEEKDAY_ISO: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_KO: Record<Weekday, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };

/** Rewrites `weekday` as weekly mon..fri so later code handles one shape. */
export function normalizeRecurrence(rule: Recurrence): Recurrence {
  if (rule.kind !== "weekday") return rule;
  return { kind: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"], startDate: rule.startDate, endDate: rule.endDate };
}

export function occursOn(rule: Recurrence, date: string): boolean {
  if (compareDate(date, rule.startDate) < 0) return false;
  if (rule.endDate && compareDate(date, rule.endDate) > 0) return false;
  switch (rule.kind) {
    case "daily":
      return true;
    case "weekday":
      return isoWeekday(date) <= 5;
    case "weekly":
      return rule.weekdays.some((w) => WEEKDAY_ISO[w] === isoWeekday(date));
    case "monthly": {
      const { y, m, d } = parseDate(date);
      const last = daysInMonth(y, m);
      return d === (rule.day === "last" ? last : Math.min(rule.day, last));
    }
  }
}

/** All occurrence dates in [from, to], inclusive, ascending. */
export function occurrencesBetween(rule: Recurrence, from: string, to: string): string[] {
  const out: string[] = [];
  if (compareDate(from, to) > 0) return out;
  const span = diffDays(from, to);
  if (span > 3660) throw new RangeError("Recurrence expansion window is limited to ~10 years");
  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i);
    if (occursOn(rule, date)) out.push(date);
  }
  return out;
}

/** First occurrence on or after `from` (bounded search of ~13 months). */
export function firstOnOrAfter(rule: Recurrence, from: string): string | null {
  const start = maxDate(from, rule.startDate);
  for (let i = 0; i <= 400; i++) {
    const date = addDays(start, i);
    if (rule.endDate && compareDate(date, rule.endDate) > 0) return null;
    if (occursOn(rule, date)) return date;
  }
  return null;
}

/** First occurrence strictly after `after`. */
export function firstAfter(rule: Recurrence, after: string): string | null {
  return firstOnOrAfter(rule, addDays(after, 1));
}

export function describeRecurrence(rule: Recurrence): string {
  switch (rule.kind) {
    case "daily":
      return "매일";
    case "weekday":
      return "평일";
    case "weekly": {
      const sorted = [...rule.weekdays].sort((a, b) => WEEKDAY_ISO[a] - WEEKDAY_ISO[b]);
      if (sorted.length === 7) return "매일";
      return `매주 ${sorted.map((d) => WEEKDAY_KO[d]).join("·")}`;
    }
    case "monthly":
      return rule.day === "last" ? "매월 말일" : `매월 ${rule.day}일`;
  }
}
