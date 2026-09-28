import type { AiBudgetStatus, CostEstimate, Settings } from "@liferoute/contracts";
import { add, cmp, div, mul, sub } from "./money";

/**
 * AI budget (FR-009, docs/15_ai, review D-49/D-50). Monthly cap (default 3,000 KRW) is enforced on
 * used (actual ?? estimated) + reserved (consented/queued/running) + this estimate.
 * Prices are owner-entered KRW per 1M tokens; no exchange rate is fetched.
 */
export function estimateInputTokens(chars: number, charsPerToken: number): number {
  return Math.ceil(chars / Math.max(1, charsPerToken));
}

/** Cost in whole KRW, rounded up so the cap is never under-estimated. */
export function tokenCostKrw(inputTokens: number, outputTokens: number, ai: Settings["ai"]): string | null {
  if (ai.inputKrwPer1MTokens === null || ai.outputKrwPer1MTokens === null) return null;
  const input = mul(String(inputTokens), ai.inputKrwPer1MTokens);
  const output = mul(String(outputTokens), ai.outputKrwPer1MTokens);
  return div(add(input, output), "1000000", 0, "ceil");
}

export interface UsageLike {
  monthKey: string;
  estimatedCostKrw: string;
  actualCostKrw: string | null;
}
export interface ReservationLike {
  status: string;
  estimate: { costKrw: string } | null;
}

const RESERVING = new Set(["consented", "queued", "running"]);

export function budgetStatus(
  ai: Settings["ai"],
  monthKey: string,
  usages: readonly UsageLike[],
  analyses: readonly ReservationLike[],
): AiBudgetStatus {
  const used = add(
    "0",
    ...usages.filter((u) => u.monthKey === monthKey).map((u) => u.actualCostKrw ?? u.estimatedCostKrw),
  );
  const reserved = add(
    "0",
    ...analyses.filter((a) => RESERVING.has(a.status) && a.estimate).map((a) => a.estimate!.costKrw),
  );
  const remaining = sub(ai.monthlyBudgetKrw, add(used, reserved));
  return {
    monthKey,
    budgetKrw: ai.monthlyBudgetKrw,
    usedKrw: used,
    reservedKrw: reserved,
    remainingKrw: remaining,
    configured:
      ai.provider !== "disconnected" && ai.inputKrwPer1MTokens !== null && ai.outputKrwPer1MTokens !== null,
  };
}

export function buildEstimate(
  ai: Settings["ai"],
  chars: number,
  status: AiBudgetStatus,
  computedAt: string,
): CostEstimate | null {
  const inputTokens = estimateInputTokens(chars, ai.charsPerToken);
  const outputTokens = ai.maxOutputTokens;
  const costKrw = tokenCostKrw(inputTokens, outputTokens, ai);
  if (costKrw === null) return null;
  return {
    chars,
    inputTokens,
    outputTokens,
    costKrw,
    monthKey: status.monthKey,
    budgetKrw: status.budgetKrw,
    usedKrw: status.usedKrw,
    reservedKrw: status.reservedKrw,
    remainingKrw: status.remainingKrw,
    computedAt,
  };
}

/** True when running this estimate would exceed the monthly cap. */
export function exceedsBudget(estimate: CostEstimate): boolean {
  return cmp(estimate.costKrw, estimate.remainingKrw) > 0;
}
