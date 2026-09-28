import {
  BASE_CURRENCY,
  type Account,
  type AccountBalanceRow,
  type BalanceSnapshot,
  type NetWorthSummary,
  type Settings,
} from "@liferoute/contracts";
import { addDays, compareDate, dateInZone, monthsBetween } from "./date";
import { add, cmp, div, isPositive, sub, toKrw } from "./money";

/**
 * Net worth (FR-005, docs/07_finance, review D-13..D-18).
 * - netWorth = Σ included assets − Σ ALL liabilities (liabilities cannot be excluded; archive removes them).
 * - liquidAssets = Σ included & liquid assets, liabilities not subtracted.
 * - An account without a snapshot on/before `asOf` is "missing" and contributes 0.
 * - "stale" = latest snapshot older than today − staleAfterDays. Either makes data "incomplete".
 * - Goal: gap = goal − netWorth; monthlyRequired = ceil(gap / remainingMonths) in whole KRW.
 */
type AccountLike = Pick<Account, "id" | "kind" | "included" | "liquid" | "archivedAt">;
type SnapshotLike = Pick<BalanceSnapshot, "id" | "accountId" | "asOf" | "amountKrw" | "estimated">;

/** Derived KRW value of a snapshot (review D-15): KRW amounts pass through; foreign amounts use fxRate. */
export function snapshotAmountKrw(amount: string, currency: string, fxRate: string | null): string {
  if (currency === BASE_CURRENCY) return amount;
  if (fxRate === null) throw new RangeError("fxRate is required for a non-KRW snapshot");
  return toKrw(amount, fxRate);
}

/** Latest snapshot per account with asOf <= `asOf` (ties broken by later createdAt order in input). */
export function latestSnapshots<T extends SnapshotLike>(snapshots: readonly T[], asOf: string): Map<string, T> {
  const latest = new Map<string, T>();
  for (const s of snapshots) {
    if (compareDate(s.asOf, asOf) > 0) continue;
    const current = latest.get(s.accountId);
    if (!current || compareDate(s.asOf, current.asOf) >= 0) latest.set(s.accountId, s);
  }
  return latest;
}

/** Accounts that count on `asOf`: not archived on or before that calendar day (Asia/Seoul). */
export function activeAccountsOn<T extends AccountLike>(accounts: readonly T[], asOf: string, timeZone: string): T[] {
  return accounts.filter((a) => a.archivedAt === null || dateInZone(a.archivedAt, timeZone) > asOf);
}

export interface NetWorthInput {
  accounts: readonly AccountLike[];
  snapshots: readonly SnapshotLike[];
  today: string;
  finance: Settings["finance"];
  timeZone: string;
  /** Evaluate balances as of this date (defaults to today). Used by reviews for period starts/ends. */
  asOf?: string;
}

export function computeNetWorth(input: NetWorthInput): NetWorthSummary {
  const asOf = input.asOf ?? input.today;
  const accounts = activeAccountsOn(input.accounts, asOf, input.timeZone);
  const latest = latestSnapshots(input.snapshots, asOf);
  const staleBefore = addDays(input.today, -input.finance.staleAfterDays);

  let assets = "0";
  let liabilities = "0";
  let liquid = "0";
  const rows: AccountBalanceRow[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const estimated: string[] = [];
  let earliest: string | null = null;
  let latestAsOf: string | null = null;

  for (const account of accounts) {
    const snap = latest.get(account.id);
    const isLiability = account.kind === "liability";
    const counts = isLiability || account.included;
    if (!snap) {
      if (counts) missing.push(account.id);
      rows.push({
        accountId: account.id,
        latestSnapshotId: null,
        asOf: null,
        amountKrw: null,
        estimated: false,
        missing: true,
        stale: false,
      });
      continue;
    }
    const isStale = compareDate(snap.asOf, staleBefore) < 0;
    rows.push({
      accountId: account.id,
      latestSnapshotId: snap.id,
      asOf: snap.asOf,
      amountKrw: snap.amountKrw,
      estimated: snap.estimated,
      missing: false,
      stale: isStale,
    });
    if (!counts) continue;
    if (isStale) stale.push(account.id);
    if (snap.estimated) estimated.push(account.id);
    if (earliest === null || snap.asOf < earliest) earliest = snap.asOf;
    if (latestAsOf === null || snap.asOf > latestAsOf) latestAsOf = snap.asOf;
    if (isLiability) {
      liabilities = add(liabilities, snap.amountKrw);
    } else {
      assets = add(assets, snap.amountKrw);
      if (account.liquid) liquid = add(liquid, snap.amountKrw);
    }
  }

  const netWorth = sub(assets, liabilities);
  const goal = goalProgress(netWorth, input.today, input.finance);
  return {
    today: input.today,
    netWorthKrw: netWorth,
    includedAssetsKrw: assets,
    liabilitiesKrw: liabilities,
    liquidAssetsKrw: liquid,
    accounts: rows,
    missingAccountIds: missing,
    staleAccountIds: stale,
    estimatedAccountIds: estimated,
    earliestAsOf: earliest,
    latestAsOf,
    data: missing.length > 0 || stale.length > 0 ? "incomplete" : "complete",
    goal,
  };
}

export function goalProgress(
  netWorthKrw: string,
  today: string,
  finance: Settings["finance"],
): NetWorthSummary["goal"] {
  const gap = sub(finance.goalAmountKrw, netWorthKrw);
  const achieved = !isPositive(gap);
  const overdue = compareDate(today, finance.goalTargetDate) > 0;
  const remainingMonths = overdue ? 0 : Math.max(1, monthsBetween(today, finance.goalTargetDate));
  const status = achieved ? "achieved" : overdue ? "overdue" : "active";
  return {
    amountKrw: finance.goalAmountKrw,
    startDate: finance.goalStartDate,
    targetDate: finance.goalTargetDate,
    gapKrw: gap,
    remainingMonths,
    monthlyRequiredKrw: status === "active" ? div(gap, String(remainingMonths), 0, "ceil") : null,
    status,
  };
}

/** Share of the goal reached, 0..100 (for the progress bar only; clamps negatives to 0). */
export function goalPercent(netWorthKrw: string, goalAmountKrw: string): number {
  if (!isPositive(goalAmountKrw) || !isPositive(netWorthKrw)) return 0;
  if (cmp(netWorthKrw, goalAmountKrw) >= 0) return 100;
  // Display-only ratio; two decimals of precision are plenty for a bar width.
  return Number(div(netWorthKrw, goalAmountKrw, 4, "down")) * 100;
}
