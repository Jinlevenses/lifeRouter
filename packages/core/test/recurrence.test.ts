import { describe, expect, it } from "vitest";
import type { Recurrence } from "@liferoute/contracts";
import { describeRecurrence, firstAfter, normalizeRecurrence, occurrencesBetween, occursOn } from "../src/recurrence";

const base = { startDate: "2026-01-01", endDate: null };

describe("UNIT-REC-001 recurrence (FR-003)", () => {
  it("daily starts on startDate and respects endDate", () => {
    const rule: Recurrence = { kind: "daily", startDate: "2026-09-28", endDate: "2026-09-30" };
    expect(occursOn(rule, "2026-09-27")).toBe(false);
    expect(occurrencesBetween(rule, "2026-09-25", "2026-10-02")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("weekday means Monday to Friday", () => {
    const rule: Recurrence = { kind: "weekday", ...base };
    expect(occurrencesBetween(rule, "2026-09-26", "2026-10-04")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(normalizeRecurrence(rule)).toMatchObject({ kind: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] });
  });

  it("weekly uses named weekdays", () => {
    const rule: Recurrence = { kind: "weekly", weekdays: ["mon", "thu"], ...base };
    expect(occurrencesBetween(rule, "2026-09-28", "2026-10-05")).toEqual(["2026-09-28", "2026-10-01", "2026-10-05"]);
    expect(describeRecurrence(rule)).toBe("매주 월·목");
  });

  it("monthly clamps 29–31 to the month's last day and supports 'last'", () => {
    const d31: Recurrence = { kind: "monthly", day: 31, ...base };
    expect(occurrencesBetween(d31, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    const d29: Recurrence = { kind: "monthly", day: 29, startDate: "2028-01-01", endDate: null };
    expect(occurrencesBetween(d29, "2028-02-01", "2028-03-31")).toEqual(["2028-02-29", "2028-03-29"]);
    const last: Recurrence = { kind: "monthly", day: "last", ...base };
    expect(firstAfter(last, "2026-02-28")).toBe("2026-03-31");
  });

  it("finds nothing after the end date", () => {
    const rule: Recurrence = { kind: "daily", startDate: "2026-01-01", endDate: "2026-01-05" };
    expect(firstAfter(rule, "2026-01-05")).toBeNull();
  });
});
