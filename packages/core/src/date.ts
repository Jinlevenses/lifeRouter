/**
 * Date-only calendar arithmetic (ADR-002). A DateOnly is "YYYY-MM-DD" in the owner's
 * timezone; it never passes through a JS Date in local time. Instants are UTC ISO strings.
 */
export const DATE_ONLY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const DEFAULT_TIMEZONE = "Asia/Seoul";

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return d <= daysInMonth(y, m);
}

export function parseDate(value: string): Ymd {
  if (!isDateOnly(value)) throw new RangeError(`Invalid date-only value: ${JSON.stringify(value)}`);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

export function formatDate({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  const lengths = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[m - 1] ?? 0;
}

/** Days since 1970-01-01 (proleptic Gregorian); pure integer arithmetic, no timezone. */
export function toEpochDay(value: string): number {
  const { y, m, d } = parseDate(value);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromEpochDay(day: number): string {
  const date = new Date(day * 86_400_000);
  return formatDate({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
}

export function addDays(value: string, days: number): string {
  return fromEpochDay(toEpochDay(value) + days);
}

export function diffDays(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compareDate(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(value: string): number {
  const dow = new Date(toEpochDay(value) * 86_400_000).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Adds months, clamping the day to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: string, months: number): string {
  const { y, m, d } = parseDate(value);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return formatDate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export function startOfMonth(value: string): string {
  const { y, m } = parseDate(value);
  return formatDate({ y, m, d: 1 });
}

export function endOfMonth(value: string): string {
  const { y, m } = parseDate(value);
  return formatDate({ y, m, d: daysInMonth(y, m) });
}

/** Monday of the ISO week that contains `value`. */
export function startOfIsoWeek(value: string): string {
  return addDays(value, 1 - isoWeekday(value));
}

/**
 * Whole calendar months from `from` to `to`, counting a partial month as a month
 * only when the day-of-month has been reached (2026-01-15 → 2026-03-14 is 1, → 2026-03-15 is 2).
 */
export function monthsBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  const anchorDay = Math.min(a.d, daysInMonth(b.y, b.m));
  if (months > 0 && b.d < anchorDay) months -= 1;
  if (months < 0 && b.d > anchorDay) months += 1;
  return months;
}

/** The calendar date of `instant` in `timeZone` (default Asia/Seoul). */
export function dateInZone(instant: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid instant");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayInZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return dateInZone(now, timeZone);
}

/** Minutes offset of `timeZone` from UTC at `instant` (Asia/Seoul is +540). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * UTC instant of local midnight at the start of `date` in `timeZone`.
 * Used to turn date-only ranges into instant bounds for calendar queries.
 */
export function startOfDayInstant(date: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const { y, m, d } = parseDate(date);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const offset = zoneOffsetMinutes(guess, timeZone);
  let instant = new Date(guess.getTime() - offset * 60_000);
  // Re-check once in case the offset differs at the adjusted instant (DST edges).
  const offset2 = zoneOffsetMinutes(instant, timeZone);
  if (offset2 !== offset) instant = new Date(guess.getTime() - offset2 * 60_000);
  return instant.toISOString();
}

export function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

const KO_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export function koWeekday(isoDay: number): string {
  return KO_WEEKDAYS[(isoDay - 1) % 7] ?? "";
}

/** "9월 28일 (월)" */
export function formatDateKo(value: string, withWeekday = true): string {
  const { m, d } = parseDate(value);
  return withWeekday ? `${m}월 ${d}일 (${koWeekday(isoWeekday(value))})` : `${m}월 ${d}일`;
}

/** "YYYY-MM" of a date-only value (Asia/Seoul calendar month when `value` came from todayInZone). */
export function monthKey(value: string): string {
  return value.slice(0, 7);
}

/** ISO-8601 week-numbering year and week (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(value: string): { year: number; week: number } {
  const thursday = addDays(value, 4 - isoWeekday(value));
  const { y } = parseDate(thursday);
  const week = Math.floor(diffDays(`${String(y).padStart(4, "0")}-01-01`, thursday) / 7) + 1;
  return { year: y, week };
}

export type PeriodKind = "weekly" | "monthly";

export interface Period {
  kind: PeriodKind;
  start: string;
  /** Inclusive. */
  end: string;
  /** "weekly:2026-W40" | "monthly:2026-09" */
  key: string;
}

/** The review period (ISO week Mon–Sun, or calendar month) that contains `date`. */
export function periodContaining(kind: PeriodKind, date: string): Period {
  if (kind === "weekly") {
    const start = startOfIsoWeek(date);
    const { year, week } = isoWeek(date);
    return { kind, start, end: addDays(start, 6), key: `weekly:${year}-W${String(week).padStart(2, "0")}` };
  }
  return { kind, start: startOfMonth(date), end: endOfMonth(date), key: `monthly:${monthKey(date)}` };
}

export function isWithin(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}
