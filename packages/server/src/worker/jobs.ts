import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { IDEMPOTENCY_TTL_HOURS, JOB_NAMES } from "@liferoute/contracts";
import { monthKey, tokenCostKrw, todayInZone } from "@liferoute/core";
import type { Db } from "../db/client";
import { aiUsage, analyses, commandLog, notes, opsState, proposals, receipts, settings } from "../db/schema";
import type { Integrations } from "../integrations";
import type { JobQueue } from "../jobs";
import { log, maskSecrets } from "../logger";
import { toSettings } from "../mappers";
import { createBackup, pruneBackups } from "../ops/archive";
import { parseBackupKey } from "../ops/crypto";
import { backupsDir } from "../storage";

/**
 * Worker job bodies (docs/11_operations). Each is idempotent: re-running after a crash or a
 * duplicate delivery leaves the same end state.
 */
export async function runAnalysis(db: Db, integrations: Integrations, analysisId: string, now = new Date()): Promise<void> {
  const claimed = await db
    .update(analyses)
    .set({ status: "running", startedAt: now, updatedAt: now, version: sql`version + 1` })
    .where(and(eq(analyses.id, analysisId), eq(analyses.status, "queued")))
    .returning();
  const analysis = claimed[0];
  if (!analysis) return; // already handled or cancelled
  const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "settings"));
  const ai = toSettings(settingsRow!).ai;
  try {
    if (!integrations.ai.available) throw new Error("AI provider is not configured");
    // Only the consented notes are sent (docs/15_ai).
    const noteRows = await db
      .select({ title: notes.title, text: notes.text })
      .from(notes)
      .where(and(inArray(notes.id, analysis.noteIds), isNull(notes.deletedAt)));
    const result = await integrations.ai.analyze({
      model: analysis.model ?? ai.model ?? "claude-opus-5",
      purpose: analysis.purpose,
      documents: noteRows,
      maxOutputTokens: analysis.estimate?.outputTokens ?? ai.maxOutputTokens,
    });
    const usageId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(aiUsage).values({
        id: usageId,
        analysisId: analysis.id,
        monthKey: analysis.estimate?.monthKey ?? monthKey(todayInZone("Asia/Seoul", now)),
        provider: "anthropic",
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostKrw: analysis.estimate?.costKrw ?? "0",
        actualCostKrw: tokenCostKrw(result.inputTokens, result.outputTokens, ai),
        occurredAt: new Date(),
      });
      await tx
        .update(analyses)
        .set({
          status: "completed",
          resultText: result.text,
          model: result.model,
          usageId,
          finishedAt: new Date(),
          updatedAt: new Date(),
          version: sql`version + 1`,
        })
        .where(eq(analyses.id, analysis.id));
    });
  } catch (error) {
    log.error("ai.analysis_failed", error, { analysisId });
    await db
      .update(analyses)
      .set({
        status: "failed",
        error: maskSecrets(error instanceof Error ? error.message : String(error)),
        finishedAt: new Date(),
        updatedAt: new Date(),
        version: sql`version + 1`,
      })
      .where(eq(analyses.id, analysis.id));
  }
}

export async function runBackup(db: Db, now = new Date()): Promise<{ fileName: string; pruned: string[] } | null> {
  const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "settings"));
  const backup = settingsRow?.backup;
  if (backup && !backup.enabled) return null;
  const key = parseBackupKey(process.env.LIFEROUTE_BACKUP_KEY);
  const result = await createBackup(db, { key, now });
  const pruned = await pruneBackups(backupsDir(), backup?.retention ?? { daily: 7, weekly: 4, monthly: 12 });
  log.info("backup.completed", { file: result.fileName, pruned: pruned.length });
  return { fileName: result.fileName, pruned };
}

/** Catch-up rule (review D-53): if the last success is older than 24h, back up now. */
export async function backupIsDue(db: Db, now = new Date()): Promise<boolean> {
  const [row] = await db.select().from(opsState).where(eq(opsState.key, "backup.last"));
  const at = (row?.value as { at?: string | null } | undefined)?.at;
  return !at || now.getTime() - Date.parse(at) > 24 * 3600_000;
}

export async function pruneIdempotency(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * 3600_000);
  const removed = await db.delete(commandLog).where(lt(commandLog.createdAt, cutoff)).returning({ k: commandLog.idempotencyKey });
  return removed.length;
}

/** OCR is optional: with no engine the receipt stays a manual draft (never a guessed record). */
export async function runOcr(db: Db, integrations: Integrations, receiptId: string): Promise<void> {
  const [row] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
  if (!row || row.status !== "draft") return;
  if (!integrations.ocr.available) {
    await db
      .update(receipts)
      .set({ ocr: { ...row.ocr, status: "unavailable" }, updatedAt: new Date(), version: sql`version + 1` })
      .where(eq(receipts.id, row.id));
  }
}

export async function heartbeat(db: Db, now = new Date()): Promise<void> {
  await db
    .insert(opsState)
    .values({ key: "worker.heartbeat", value: { at: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({ target: opsState.key, set: { value: { at: now.toISOString() }, updatedAt: now } });
}

/** Re-enqueues work whose post-commit enqueue may have been lost (idempotent job bodies make this safe). */
export async function sweep(db: Db, jobs: JobQueue, now = new Date()): Promise<number> {
  const olderThan = new Date(now.getTime() - 2 * 60_000);
  const [approved, queued] = await Promise.all([
    db.select({ id: proposals.id }).from(proposals).where(and(eq(proposals.status, "approved"), lt(proposals.updatedAt, olderThan))),
    db.select({ id: analyses.id }).from(analyses).where(and(eq(analyses.status, "queued"), lt(analyses.updatedAt, olderThan))),
  ]);
  for (const p of approved) await jobs.send(JOB_NAMES.googleApplyProposal, { proposalId: p.id }, { singletonKey: p.id });
  for (const a of queued) await jobs.send(JOB_NAMES.aiAnalysis, { analysisId: a.id }, { singletonKey: a.id });
  return approved.length + queued.length;
}
