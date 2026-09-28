import { describe, expect, it } from "vitest";
import type { Recurrence } from "@liferoute/contracts";
import { isOverdue, nextDueDate, pickTopRank, staleTopTasks, topTasksFor } from "../src/tasks";

const t = (id: string, topDate: string | null, topRank: 1 | 2 | 3 | null, status: "open" | "done" = "open") => ({
  id,
  status,
  topDate,
  topRank,
  deletedAt: null,
});

describe("UNIT-TASK-001 planning rules (FR-002)", () => {
  it("assigns the lowest free rank and refuses a fourth top task", () => {
    const tasks = [t("a", "2026-09-28", 1), t("b", "2026-09-28", 3)];
    expect(pickTopRank(tasks, "2026-09-28", "c")).toEqual({ ok: true, rank: 2 });
    const full = [...tasks, t("c", "2026-09-28", 2)];
    expect(pickTopRank(full, "2026-09-28", "d")).toEqual({ ok: false, code: "TOP_LIMIT_EXCEEDED" });
    expect(pickTopRank(full, "2026-09-28", "d", 1)).toEqual({ ok: false, code: "TOP_RANK_TAKEN" });
    // re-ranking a task that is already in the day's Top 3 ignores its own slot
    expect(pickTopRank(full, "2026-09-28", "a", 1)).toEqual({ ok: true, rank: 1 });
  });

  it("done tasks free their top slot", () => {
    const tasks = [t("a", "2026-09-28", 1, "done"), t("b", "2026-09-28", 2), t("c", "2026-09-28", 3)];
    expect(pickTopRank(tasks, "2026-09-28", "d")).toEqual({ ok: true, rank: 1 });
    expect(topTasksFor(tasks, "2026-09-28").map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("never carries top tasks over automatically", () => {
    const tasks = [t("old", "2026-09-27", 1), t("today", "2026-09-28", 1)];
    expect(staleTopTasks(tasks, "2026-09-28").map((x) => x.id)).toEqual(["old"]);
    expect(topTasksFor(tasks, "2026-09-28").map((x) => x.id)).toEqual(["today"]);
  });

  it("rolls a recurring task to the first occurrence after max(due, today)", () => {
    const weekly: Recurrence = { kind: "weekly", weekdays: ["mon"], startDate: "2026-01-05", endDate: null };
    // completed on time
    expect(nextDueDate(weekly, "2026-09-28", "2026-09-28")).toBe("2026-10-05");
    // completed three weeks late: no pile-up of missed repeats
    expect(nextDueDate(weekly, "2026-09-07", "2026-09-28")).toBe("2026-10-05");
    // completed early
    expect(nextDueDate(weekly, "2026-10-05", "2026-09-30")).toBe("2026-10-12");
  });

  it("dueDate and plannedAt are independent; overdue uses dueDate only", () => {
    expect(isOverdue({ status: "open", dueDate: "2026-09-27" }, "2026-09-28")).toBe(true);
    expect(isOverdue({ status: "open", dueDate: null }, "2026-09-28")).toBe(false);
    expect(isOverdue({ status: "done", dueDate: "2026-09-01" }, "2026-09-28")).toBe(false);
  });
});
