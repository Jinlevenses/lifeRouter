import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateInZone,
  endOfMonth,
  formatDateKo,
  isDateOnly,
  isoWeekday,
  monthsBetween,
  startOfDayInstant,
  startOfIsoWeek,
} from "../src/date";

describe("date-only arithmetic", () => {
  it("validates real calendar dates", () => {
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isDateOnly("2026-9-1")).toBe(false);
  });

  it("adds days across month and year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("clamps month arithmetic to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(endOfMonth("2026-04-10")).toBe("2026-04-30");
  });

  it("computes ISO weekdays and week starts", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
    expect(startOfIsoWeek("2026-10-04")).toBe("2026-09-28");
  });

  it("counts whole months", () => {
    expect(monthsBetween("2026-01-15", "2026-03-14")).toBe(1);
    expect(monthsBetween("2026-01-15", "2026-03-15")).toBe(2);
    expect(monthsBetween("2026-01-31", "2026-02-28")).toBe(1);
    expect(monthsBetween("2026-09-29", "2029-09-29")).toBe(36);
  });

  it("resolves the Seoul calendar date of an instant", () => {
    expect(dateInZone("2026-09-28T15:30:00Z")).toBe("2026-09-29");
    expect(dateInZone("2026-09-28T14:59:59Z")).toBe("2026-09-28");
    expect(startOfDayInstant("2026-09-29")).toBe("2026-09-28T15:00:00.000Z");
    expect(startOfDayInstant("2026-03-08", "America/New_York")).toBe("2026-03-08T05:00:00.000Z");
  });

  it("formats in Korean", () => {
    expect(formatDateKo("2026-09-28")).toBe("9월 28일 (월)");
  });
});
