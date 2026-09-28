import { describe, expect, it } from "vitest";
import type { Settings } from "@liferoute/contracts";
import { budgetStatus, buildEstimate, exceedsBudget, tokenCostKrw } from "../src/ai-budget";
import { applyOcrFields, applyOwnerFields, emptyReceiptFields, suggestConfirmed } from "../src/receipts";
import { canTransition } from "../src/transitions";

const ai: Settings["ai"] = {
  monthlyBudgetKrw: "3000",
  provider: "anthropic",
  model: "claude-opus-5",
  inputKrwPer1MTokens: "7000",
  outputKrwPer1MTokens: "35000",
  charsPerToken: 2,
  maxOutputTokens: 2000,
};

describe("UNIT-RECEIPT-001 receipts stay drafts until confirmed (FR-007)", () => {
  it("drops low-confidence OCR and never overwrites owner values", () => {
    let fields = emptyReceiptFields();
    fields = applyOwnerFields(fields, { merchant: "동네마트" });
    fields = applyOcrFields(fields, {
      merchant: { value: "OCR마트", confidence: 0.99 },
      amount: { value: "12000", confidence: 0.9 },
      date: { value: "2026-09-28", confidence: 0.3 },
    });
    expect(fields.merchant).toEqual({ value: "동네마트", confidence: null, source: "owner" });
    expect(fields.amount).toEqual({ value: "12000", confidence: 0.9, source: "ocr" });
    expect(fields.date).toEqual({ value: null, confidence: null, source: "none" });
    expect(suggestConfirmed(fields)).toEqual({ merchant: "동네마트", amountKrw: "12000", date: undefined });
  });
});

describe("UNIT-AI-BUDGET-001 monthly AI cap (FR-009)", () => {
  it("prices tokens in whole KRW, rounding up", () => {
    expect(tokenCostKrw(10_000, 2_000, ai)).toBe("140");
    expect(tokenCostKrw(1, 0, ai)).toBe("1");
    expect(tokenCostKrw(1, 0, { ...ai, inputKrwPer1MTokens: null })).toBeNull();
  });

  it("counts used (actual ?? estimate) + reserved against the cap", () => {
    const status = budgetStatus(
      ai,
      "2026-09",
      [
        { monthKey: "2026-09", estimatedCostKrw: "500", actualCostKrw: "420" },
        { monthKey: "2026-09", estimatedCostKrw: "300", actualCostKrw: null },
        { monthKey: "2026-08", estimatedCostKrw: "2900", actualCostKrw: "2900" },
      ],
      [
        { status: "queued", estimate: { costKrw: "1000" } },
        { status: "completed", estimate: { costKrw: "999" } },
      ],
    );
    expect(status).toMatchObject({ usedKrw: "720", reservedKrw: "1000", remainingKrw: "1280", configured: true });
    const small = buildEstimate(ai, 20_000, status, "2026-09-28T00:00:00.000Z")!;
    expect(small.costKrw).toBe("140");
    expect(exceedsBudget(small)).toBe(false);
    const huge = buildEstimate(ai, 400_000, status, "2026-09-28T00:00:00.000Z")!;
    expect(exceedsBudget(huge)).toBe(true);
  });
});

describe("UNIT-STATE-001 state machines", () => {
  it("follows the contract transition tables", () => {
    expect(canTransition("inbox", "new", "converted")).toBe(true);
    expect(canTransition("inbox", "archived", "converted")).toBe(false);
    expect(canTransition("proposal", "pending", "applied")).toBe(false);
    expect(canTransition("proposal", "approved", "applied")).toBe(true);
    expect(canTransition("analysis", "previewed", "running")).toBe(false);
  });
});
