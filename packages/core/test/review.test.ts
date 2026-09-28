import { describe, expect, it } from "vitest";
import type { Recurrence, Settings } from "@liferoute/contracts";
import { periodContaining } from "../src/date";
import { computeReview, draftFromComputed, stableStringify, type ReviewInput } from "../src/review";

const finance: Settings["finance"] = {
  goalAmountKrw: "100000000",
  goalStartDate: "2026-09-01",
  goalTargetDate: "2029-09-01",
  staleAfterDays: 35,
};
const schedule: Recurrence = { kind: "daily", startDate: "2026-09-01", endDate: null };

function fixture(): ReviewInput {
  return {
    period: periodContaining("weekly", "2026-09-23"), // 2026-09-21 .. 2026-09-27
    today: "2026-09-28",
    timeZone: "Asia/Seoul",
    finance,
    tasks: [
      // completed Tue 22nd 23:30 KST (14:30Z) → counts
      {
        id: "t1",
        title: "보고서",
        status: "done",
        dueDate: "2026-09-22",
        completedAt: "2026-09-22T14:30:00.000Z",
        deletedAt: null,
      },
      // due in period, still open → overdue
      {
        id: "t2",
        title: "세금 신고",
        status: "open",
        dueDate: "2026-09-25",
        completedAt: null,
        deletedAt: null,
      },
      // due in period, completed after the period → overdue at period end
      {
        id: "t3",
        title: "청소",
        status: "done",
        dueDate: "2026-09-26",
        completedAt: "2026-09-28T01:00:00.000Z",
        deletedAt: null,
      },
      // completed Sun 27th 23:59 KST → counts; Mon 28th 00:01 KST would not
      {
        id: "t4",
        title: "운동화",
        status: "done",
        dueDate: null,
        completedAt: "2026-09-27T14:59:00.000Z",
        deletedAt: null,
      },
    ],
    routines: [{ id: "r1", title: "물 마시기", schedule, status: "active", deletedAt: null }],
    checkIns: [
      { routineId: "r1", date: "2026-09-21", status: "done" },
      { routineId: "r1", date: "2026-09-22", status: "done" },
      { routineId: "r1", date: "2026-09-23", status: "skipped" },
    ],
    accounts: [{ id: "a", kind: "asset", included: true, liquid: true, archivedAt: null }],
    snapshots: [
      { id: "s1", accountId: "a", asOf: "2026-09-15", amountKrw: "1000000", estimated: false },
      { id: "s2", accountId: "a", asOf: "2026-09-26", amountKrw: "1200000", estimated: false },
    ],
    receipts: [
      {
        status: "confirmed",
        confirmed: { merchant: "마트", amountKrw: "32000", date: "2026-09-24", category: null, memo: null },
      },
      { status: "draft", confirmed: null },
      {
        status: "confirmed",
        confirmed: { merchant: "카페", amountKrw: "5500", date: "2026-09-28", category: null, memo: null },
      },
    ],
    notes: [{ createdAt: "2026-09-21T00:00:00.000Z", deletedAt: null }],
  };
}

describe("UNIT-REVIEW-001 deterministic reviews (FR-009)", () => {
  it("aggregates the ISO week with Asia/Seoul boundaries", () => {
    const computed = computeReview(fixture());
    expect(computed.completedTasks).toEqual({ count: 2, taskIds: ["t1", "t4"] });
    expect(computed.overdueTasks).toEqual({ count: 2, taskIds: ["t2", "t3"] });
    expect(computed.routines).toEqual([{ routineId: "r1", expected: 7, done: 2, skipped: 1, unrecorded: 4 }]);
    expect(computed.netWorth).toEqual({
      startKrw: "1000000",
      endKrw: "1200000",
      deltaKrw: "200000",
      incomplete: false,
    });
    expect(computed.spendingKrw).toBe("32000");
    expect(computed.notesCreated).toBe(1);
    expect(computed.checkInsRecorded).toBe(3);
  });

  it("is deterministic for identical inputs", () => {
    const a = computeReview(fixture());
    const b = computeReview(fixture());
    expect(stableStringify(a)).toBe(stableStringify(b));
    const names = { tasks: new Map([["t2", "세금 신고"]]), routines: new Map([["r1", "물 마시기"]]) };
    expect(draftFromComputed(a, names)).toEqual(draftFromComputed(b, names));
    expect(draftFromComputed(a, names).wins).toContain("할 일 2개를 완료했습니다.");
  });

  it("does not count tasks due today as overdue in the period in progress", () => {
    const input = fixture();
    const current = computeReview({
      ...input,
      period: periodContaining("weekly", "2026-09-30"),
      today: "2026-09-30",
      tasks: [
        {
          id: "due-today",
          title: "a",
          status: "open",
          dueDate: "2026-09-30",
          completedAt: null,
          deletedAt: null,
        },
        {
          id: "due-yesterday",
          title: "b",
          status: "open",
          dueDate: "2026-09-29",
          completedAt: null,
          deletedAt: null,
        },
      ],
    });
    expect(current.overdueTasks.taskIds).toEqual(["due-yesterday"]);
  });

  it("stableStringify sorts keys", () => {
    expect(stableStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });
});
