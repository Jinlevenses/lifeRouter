import { describe, expect, it } from "vitest";
import type { Settings } from "@liferoute/contracts";
import { computeNetWorth, goalProgress, snapshotAmountKrw } from "../src/finance";

const finance: Settings["finance"] = {
  goalAmountKrw: "100000000",
  goalStartDate: "2026-09-29",
  goalTargetDate: "2029-09-29",
  staleAfterDays: 35,
};
const acc = (
  id: string,
  kind: "asset" | "liability",
  included = true,
  liquid = false,
  archivedAt: string | null = null,
) => ({
  id,
  kind,
  included,
  liquid,
  archivedAt,
});
const snap = (accountId: string, asOf: string, amountKrw: string, estimated = false) => ({
  id: `${accountId}-${asOf}`,
  accountId,
  asOf,
  amountKrw,
  estimated,
});

describe("UNIT-FIN-001 net worth (FR-005)", () => {
  const today = "2026-09-29";
  const base = { today, finance, timeZone: "Asia/Seoul" };

  it("subtracts all liabilities from included assets and keeps a liquid subtotal", () => {
    const summary = computeNetWorth({
      ...base,
      accounts: [
        acc("cash", "asset", true, true),
        acc("pension", "asset"),
        acc("car", "asset", false),
        acc("loan", "liability"),
      ],
      snapshots: [
        snap("cash", "2026-09-20", "5000000"),
        snap("pension", "2026-09-01", "12000000.5"),
        snap("car", "2026-09-01", "20000000"),
        snap("loan", "2026-09-15", "3000000"),
      ],
    });
    expect(summary.includedAssetsKrw).toBe("17000000.5");
    expect(summary.liabilitiesKrw).toBe("3000000");
    expect(summary.netWorthKrw).toBe("14000000.5");
    expect(summary.liquidAssetsKrw).toBe("5000000");
    expect(summary.data).toBe("complete");
    expect(summary.earliestAsOf).toBe("2026-09-01");
    expect(summary.latestAsOf).toBe("2026-09-20");
  });

  it("flags missing and stale accounts as incomplete instead of hiding them", () => {
    const summary = computeNetWorth({
      ...base,
      accounts: [acc("a", "asset"), acc("b", "asset"), acc("c", "asset")],
      snapshots: [snap("a", "2026-09-28", "100", true), snap("b", "2026-08-01", "200")],
    });
    expect(summary.missingAccountIds).toEqual(["c"]);
    expect(summary.staleAccountIds).toEqual(["b"]); // older than 35 days
    expect(summary.estimatedAccountIds).toEqual(["a"]);
    expect(summary.data).toBe("incomplete");
    expect(summary.netWorthKrw).toBe("300");
  });

  it("uses the latest snapshot on or before asOf and ignores archived accounts", () => {
    const summary = computeNetWorth({
      ...base,
      accounts: [acc("a", "asset"), acc("closed", "liability", true, false, "2026-09-10T01:00:00.000Z")],
      snapshots: [
        snap("a", "2026-09-01", "100"),
        snap("a", "2026-09-25", "150"),
        snap("a", "2026-10-01", "999"),
        snap("closed", "2026-09-01", "50"),
      ],
    });
    expect(summary.netWorthKrw).toBe("150");
    const past = computeNetWorth({
      ...base,
      asOf: "2026-09-05",
      accounts: [acc("a", "asset"), acc("closed", "liability", true, false, "2026-09-10T01:00:00.000Z")],
      snapshots: [snap("a", "2026-09-01", "100"), snap("closed", "2026-09-01", "50")],
    });
    expect(past.netWorthKrw).toBe("50");
  });

  it("converts foreign snapshots to whole won", () => {
    expect(snapshotAmountKrw("1000.25", "USD", "1385.12")).toBe("1385466");
    expect(snapshotAmountKrw("5000", "KRW", null)).toBe("5000");
    expect(() => snapshotAmountKrw("1", "USD", null)).toThrow();
  });

  it("computes the 100M KRW / 36 month goal with a ceiling monthly requirement", () => {
    const g = goalProgress("14000000.5", today, finance);
    expect(g.gapKrw).toBe("85999999.5");
    expect(g.remainingMonths).toBe(36);
    expect(g.monthlyRequiredKrw).toBe("2388889"); // ceil(85,999,999.5 / 36)
    expect(g.status).toBe("active");
    expect(goalProgress("100000000", today, finance)).toMatchObject({
      status: "achieved",
      monthlyRequiredKrw: null,
    });
    expect(goalProgress("0", "2029-09-30", finance)).toMatchObject({
      status: "overdue",
      remainingMonths: 0,
      monthlyRequiredKrw: null,
    });
    // in the final partial month the remaining count never drops below 1
    expect(goalProgress("0", "2029-09-15", finance).remainingMonths).toBe(1);
  });
});
