import { addDays, compareDate, daysInMonth, diffDays, isoWeekday, parseDate } from "./date";
import type { Recurrence } from "@liferoute/contracts";

/**
 * Date-only recurrence (FR-003, docs/03_data):
 * - daily, weekday (Mon–Fri), weekly (ISO weekdays 1=Mon…7=Sun), monthly (day 1–31 or "last").
 * - A monthly day of 29–31 is clamped to the month's last day (Jan 31 → Feb 28/29).
 * - Nothing occurs before `startDate` nor after `endDate` (inclusive bounds).
 */
export function occursOn(rule: Recurrence, date: string): boolean {
  if (compareDate(date, rule.startDate) < 0) return false;
  if (rule.endDate && compareDate(date, rule.endDate) > 0) return false;
  switch (rule.kind) {
    case "daily":
      return true;
    case "weekday":
      return isoWeekday(date) <= 5;
    case "weekly":
      return rule.weekdays.includes(isoWeekday(date));
    case "monthly": {
      const { y, m, d } = parseDate(date);
      const last = daysInMonth(y, m);
      const target = rule.day === "last" ? last : Math.min(rule.day, last);
      return d === target;
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

/** First occurrence on or after `from`, searching at most ~13 months ahead. */
export function nextOccurrence(rule: Recurrence, from: string): string | null {
  const start = compareDate(from, rule.startDate) < 0 ? rule.startDate : from;
  for (let i = 0; i <= 400; i++) {
    const date = addDays(start, i);
    if (rule.endDate && compareDate(date, rule.endDate) > 0) return null;
    if (occursOn(rule, date)) return date;
  }
  return null;
}

/** Most recent occurrence strictly before `before`, searching at most ~13 months back. */
export function previousOccurrence(rule: Recurrence, before: string): string | null {
  for (let i = 1; i <= 400; i++) {
    const date = addDays(before, -i);
    if (compareDate(date, rule.startDate) < 0) return null;
    if (occursOn(rule, date)) return date;
  }
  return null;
}

const KO_ISO = ["", "월", "화", "수", "목", "금", "토", "일"];

export function describeRecurrence(rule: Recurrence): string {
  switch (rule.kind) {
    case "daily":
      return "매일";
    case "weekday":
      return "평일";
    case "weekly":
      return `매주 ${[...rule.weekdays]
        .sort((a, b) => a - b)
        .map((d) => KO_ISO[d])
        .join("·")}`;
    case "monthly":
      return rule.day === "last" ? "매월 말일" : `매월 ${rule.day}일`;
  }
}
