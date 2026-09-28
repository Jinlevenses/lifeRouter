import { TIMEZONE } from "@liferoute/contracts";
import { addDays, dateInZone, formatDateKo, startOfDayInstant } from "@liferoute/core";

/** Seoul wall-clock date + "HH:mm" → UTC ISO instant. */
export function seoulInstant(date: string, time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return new Date(Date.parse(startOfDayInstant(date, TIMEZONE)) + (h * 60 + m) * 60_000).toISOString();
}

/** UTC instant → Seoul { date, time }. */
export function seoulParts(instant: string): { date: string; time: string } {
  const d = new Date(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return { date: dateInZone(d, TIMEZONE), time };
}

export function timeLabel(instant: string): string {
  return seoulParts(instant).time;
}

/** "오늘", "내일", "어제" or "9월 30일 (수)". */
export function relativeDay(date: string, today: string): string {
  if (date === today) return "오늘";
  if (date === addDays(today, 1)) return "내일";
  if (date === addDays(today, -1)) return "어제";
  return formatDateKo(date);
}

export function instantLabel(instant: string, today: string): string {
  const { date, time } = seoulParts(instant);
  return `${relativeDay(date, today)} ${time}`;
}
