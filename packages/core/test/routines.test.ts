import { describe, expect, it } from "vitest";
import type { Recurrence } from "@liferoute/contracts";
import { currentStreak, dayState, indexCheckIns, routineStats } from "../src/routines";

const schedule: Recurrence = { kind: "weekday", startDate: "2026-09-01", endDate: null };
const routine = { id: "r1", schedule, status: "active" as const, deletedAt: null };

describe("UNIT-ROUTINE-001 routine states (FR-004)", () => {
  it("distinguishes done, skipped, unrecorded and notExpected", () => {
    expect(dayState(routine, { routineId: "r1", date: "2026-09-28", status: "done" }, "2026-09-28")).toBe("done");
    expect(dayState(routine, { routineId: "r1", date: "2026-09-28", status: "skipped" }, "2026-09-28")).toBe("skipped");
    expect(dayState(routine, undefined, "2026-09-28")).toBe("unrecorded");
    expect(dayState(routine, undefined, "2026-09-27")).toBe("notExpected"); // Sunday
    expect(dayState({ ...routine, status: "paused" }, undefined, "2026-09-28")).toBe("notExpected");
  });

  it("aggregates expected days only; a missing row is unrecorded, never skipped", () => {
    const checkIns = indexCheckIns([
      { routineId: "r1", date: "2026-09-28", status: "done" as const },
      { routineId: "r1", date: "2026-09-29", status: "skipped" as const },
      { routineId: "r1", date: "2026-09-27", status: "done" as const }, // Sunday, not expected
    ]);
    expect(routineStats(routine, checkIns, "2026-09-28", "2026-10-04")).toEqual({
      routineId: "r1",
      expected: 5,
      done: 1,
      skipped: 1,
      unrecorded: 3,
    });
  });

  it("counts a streak of done expected days", () => {
    const checkIns = indexCheckIns(
      ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"].map((date) => ({ routineId: "r1", date, status: "done" as const })),
    );
    // today (Tue 29th) not yet recorded does not break the streak
    expect(currentStreak(routine, checkIns, "2026-09-29")).toBe(4);
  });
});
