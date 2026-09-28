import type { ReceiptConfirmed, ReceiptFields } from "@liferoute/contracts";

/**
 * Receipts (FR-007, docs/09_capture, review D-19/D-36). OCR (when available) only fills a draft;
 * nothing becomes a financial record until the owner confirms. Uncertain or failed OCR leaves
 * fields empty rather than guessing. Confirmed receipts are spending records and never touch balances.
 */
export function emptyReceiptFields(): ReceiptFields {
  const none = { value: null, confidence: null, source: "none" as const };
  return { merchant: { ...none }, amount: { ...none }, currency: { ...none }, date: { ...none } };
}

export type ReceiptFieldsPatch = { [K in keyof ReceiptFields]?: ReceiptFields[K]["value"] };

/** Owner edits win and are marked source="owner"; clearing a field resets it to "none". */
export function applyOwnerFields(fields: ReceiptFields, patch: ReceiptFieldsPatch): ReceiptFields {
  const next: ReceiptFields = structuredClone(fields);
  for (const key of Object.keys(patch) as (keyof ReceiptFields)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    (next[key] as { value: unknown; confidence: number | null; source: string }) =
      value === null ? { value: null, confidence: null, source: "none" } : { value, confidence: null, source: "owner" };
  }
  return next;
}

/** OCR proposals below `minConfidence` are dropped (kept only in rawText); owner values are never overwritten. */
export function applyOcrFields(
  fields: ReceiptFields,
  ocr: Partial<{ [K in keyof ReceiptFields]: { value: ReceiptFields[K]["value"]; confidence: number } }>,
  minConfidence = 0.6,
): ReceiptFields {
  const next: ReceiptFields = structuredClone(fields);
  for (const key of Object.keys(ocr) as (keyof ReceiptFields)[]) {
    const proposal = ocr[key];
    if (!proposal || next[key].source === "owner" || proposal.confidence < minConfidence) continue;
    (next[key] as { value: unknown; confidence: number | null; source: string }) = {
      value: proposal.value,
      confidence: proposal.confidence,
      source: "ocr",
    };
  }
  return next;
}

/** Prefill for the confirm form. KRW only; other currencies must be converted by the owner. */
export function suggestConfirmed(fields: ReceiptFields): Partial<ReceiptConfirmed> {
  const currency = fields.currency.value ?? "KRW";
  return {
    merchant: fields.merchant.value ?? undefined,
    amountKrw: currency === "KRW" ? (fields.amount.value ?? undefined) : undefined,
    date: fields.date.value ?? undefined,
  };
}
