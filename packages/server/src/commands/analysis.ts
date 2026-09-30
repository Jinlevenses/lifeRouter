import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  JOB_NAMES,
  type CommandPayload,
  type CommandResultMap,
  type CostEstimate,
} from "@liferoute/contracts";
import { budgetStatus, buildEstimate, canTransition, exceedsBudget, monthKey } from "@liferoute/core";
import type { DbOrTx } from "../db/client";
import { aiUsage, analyses, notes } from "../db/schema";
import { DomainError, invalidTransition, notFound } from "../errors";
import { canon, toAnalysis } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

/**
 * Consent-gated AI analysis (FR-009, docs/15_ai, review D-49..D-51):
 * preview (selected notes, purpose, cost, remaining budget) → execute with explicit consent matching
 * the shown estimate → worker sends only those notes. The monthly cap is checked at both steps.
 */
export async function currentBudget(
  db: DbOrTx,
  settings: CommandContext["settings"],
  today: string,
  excludeAnalysisId?: string,
) {
  const month = monthKey(today);
  const usageRows = await db.select().from(aiUsage).where(eq(aiUsage.monthKey, month));
  const analysisRows = await db
    .select({ id: analyses.id, status: analyses.status, estimate: analyses.estimate })
    .from(analyses)
    .where(inArray(analyses.status, ["consented", "queued", "running"]));
  return budgetStatus(
    settings.ai,
    month,
    usageRows.map((u) => ({
      monthKey: u.monthKey,
      estimatedCostKrw: canon(u.estimatedCostKrw),
      actualCostKrw: u.actualCostKrw ? canon(u.actualCostKrw) : null,
    })),
    analysisRows
      .filter((a) => a.id !== excludeAnalysisId)
      .map((a) => ({ status: a.status, estimate: a.estimate ?? null })),
  );
}

function notConfigured(): DomainError {
  return new DomainError(
    "AI_NOT_CONFIGURED",
    "AI 분석이 설정되어 있지 않습니다.",
    undefined,
    "설정 > AI에서 제공자와 단가(원/100만 토큰)를 입력하고, 서버에 API 키를 설정하세요.",
  );
}

async function noteChars(ctx: CommandContext, noteIds: string[]) {
  const rows = await ctx.tx
    .select({ id: notes.id, title: notes.title, text: notes.text })
    .from(notes)
    .where(and(inArray(notes.id, noteIds), isNull(notes.deletedAt)));
  if (rows.length !== new Set(noteIds).size) throw notFound("선택한 노트");
  return rows.reduce((sum, n) => sum + n.title.length + n.text.length, 0);
}

async function estimateFor(
  ctx: CommandContext,
  noteIds: string[],
  excludeAnalysisId?: string,
): Promise<CostEstimate> {
  const ai = ctx.settings.ai;
  if (ai.provider === "disconnected" || !ai.model || !ctx.integrations.ai[ai.provider].available) {
    throw notConfigured();
  }
  const status = await currentBudget(ctx.tx, ctx.settings, ctx.today, excludeAnalysisId);
  const estimate = buildEstimate(ai, await noteChars(ctx, noteIds), status, ctx.now.toISOString());
  if (!estimate) throw notConfigured();
  return estimate;
}

function budgetExceeded(estimate: CostEstimate): DomainError {
  return new DomainError(
    "AI_BUDGET_EXCEEDED",
    "이번 달 AI 예산을 넘습니다.",
    { estimate },
    "선택한 노트를 줄이거나 다음 달에 다시 시도하세요.",
  );
}

export async function analysisPreview(ctx: CommandContext, p: P<"analysis.preview">): R<"analysis.preview"> {
  const noteIds = [...new Set(p.noteIds)];
  const estimate = await estimateFor(ctx, noteIds);
  if (exceedsBudget(estimate)) throw budgetExceeded(estimate);
  const [row] = await ctx.tx
    .insert(analyses)
    .values({
      id: p.id ?? randomUUID(),
      purpose: p.purpose.trim(),
      noteIds,
      status: "previewed",
      estimate,
      provider: ctx.settings.ai.provider,
      model: ctx.settings.ai.model,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { analysis: toAnalysis(row!), budget: await currentBudget(ctx.tx, ctx.settings, ctx.today) };
}

async function lockAnalysis(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(analyses).where(eq(analyses.id, id)).for("update");
  return assertVersion(row, expectedVersion, "analysis", id, toAnalysis, "AI 분석");
}

export async function analysisExecute(ctx: CommandContext, p: P<"analysis.execute">): R<"analysis.execute"> {
  const row = await lockAnalysis(ctx, p.analysisId, p.expectedVersion);
  if (!canTransition("analysis", row.status, "consented"))
    throw invalidTransition("미리보기 상태의 분석만 실행할 수 있습니다.");
  const estimate = await estimateFor(ctx, row.noteIds, row.id);
  if (estimate.costKrw !== canon(p.consentEstimateKrw)) {
    // Nothing is persisted here (the transaction rolls back on error); the new estimate travels in
    // the error so the owner can review it and consent to that exact amount.
    throw new DomainError(
      "AI_CONSENT_STALE",
      "동의한 예상 비용과 현재 예상 비용이 다릅니다.",
      { estimate },
      "새 예상 비용을 확인하고 다시 동의하세요.",
    );
  }
  if (exceedsBudget(estimate)) throw budgetExceeded(estimate);
  const [updated] = await ctx.tx
    .update(analyses)
    .set({
      status: "queued",
      estimate,
      consent: { givenAt: ctx.now.toISOString(), estimateKrw: estimate.costKrw },
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(analyses.id, row.id))
    .returning();
  ctx.afterCommit(async () => {
    await ctx.jobs.send(JOB_NAMES.aiAnalysis, { analysisId: row.id }, { singletonKey: row.id });
  });
  return { analysis: toAnalysis(updated!), jobQueued: true };
}

export async function analysisCancel(ctx: CommandContext, p: P<"analysis.cancel">): R<"analysis.cancel"> {
  const row = await lockAnalysis(ctx, p.analysisId, p.expectedVersion);
  if (!canTransition("analysis", row.status, "cancelled"))
    throw invalidTransition("이미 실행 중이거나 끝난 분석입니다.");
  const [updated] = await ctx.tx
    .update(analyses)
    .set({ status: "cancelled", updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(analyses.id, row.id))
    .returning();
  return { analysis: toAnalysis(updated!) };
}
