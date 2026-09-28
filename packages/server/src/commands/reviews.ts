import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { CommandPayload, CommandResultMap } from "@liferoute/contracts";
import {
  computeReview,
  draftFromComputed,
  periodContaining,
  stableStringify,
  type Period,
} from "@liferoute/core";
import type { DbOrTx } from "../db/client";
import {
  accounts,
  balanceSnapshots,
  checkIns,
  notes,
  receipts,
  reviews,
  routines,
  tasks,
} from "../db/schema";
import { DomainError, invalidTransition } from "../errors";
import { toAccount, toCheckIn, toReceipt, toReview, toRoutine, toSnapshot, toTask } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

/** Loads inputs, computes the deterministic review block and its hash (review D-46..D-48). */
export async function buildReview(
  db: DbOrTx,
  period: Period,
  today: string,
  settings: { timezone: string; finance: CommandContext["settings"]["finance"] },
) {
  // Sequential: `db` may be a transaction, which owns a single connection.
  const taskRows = await db.select().from(tasks);
  const routineRows = await db.select().from(routines);
  const checkInRows = await db
    .select()
    .from(checkIns)
    .where(and(gte(checkIns.date, period.start), lte(checkIns.date, period.end)));
  const accountRows = await db.select().from(accounts);
  const snapshotRows = await db.select().from(balanceSnapshots).where(lte(balanceSnapshots.asOf, period.end));
  const receiptRows = await db.select().from(receipts).where(eq(receipts.status, "confirmed"));
  const noteRows = await db.select({ createdAt: notes.createdAt, deletedAt: notes.deletedAt }).from(notes);
  const taskList = taskRows.map(toTask);
  const routineList = routineRows.map(toRoutine);
  const computed = computeReview({
    period,
    today,
    timeZone: settings.timezone,
    finance: settings.finance,
    tasks: taskList,
    routines: routineList,
    checkIns: checkInRows.map(toCheckIn),
    accounts: accountRows.map(toAccount),
    snapshots: snapshotRows.map(toSnapshot),
    receipts: receiptRows.map(toReceipt),
    notes: noteRows.map((n) => ({
      createdAt: n.createdAt.toISOString(),
      deletedAt: n.deletedAt?.toISOString() ?? null,
    })),
  });
  const names = {
    tasks: new Map(taskList.map((t) => [t.id, t.title])),
    routines: new Map(routineList.map((r) => [r.id, r.title])),
  };
  const draft = draftFromComputed(computed, names);
  const inputsHash = createHash("sha256")
    .update(stableStringify({ key: period.key, computed, draft }))
    .digest("hex");
  return { computed, draft, inputsHash };
}

export async function reviewGenerate(ctx: CommandContext, p: P<"review.generate">): R<"review.generate"> {
  if (p.date > ctx.today)
    throw new DomainError("VALIDATION_FAILED", "아직 오지 않은 기간은 검토할 수 없습니다.");
  const period = periodContaining(p.kind, p.date);
  const { computed, draft, inputsHash } = await buildReview(ctx.tx, period, ctx.today, ctx.settings);
  const [existing] = await ctx.tx.select().from(reviews).where(eq(reviews.key, period.key)).for("update");
  if (existing) {
    if (existing.status === "finalized") throw invalidTransition("확정된 검토는 다시 생성할 수 없습니다.");
    // Owner text is preserved on regeneration (review D-47).
    const [row] = await ctx.tx
      .update(reviews)
      .set({
        computed,
        draft,
        inputsHash,
        generatedAt: ctx.now,
        updatedAt: ctx.now,
        version: sql`version + 1`,
      })
      .where(eq(reviews.id, existing.id))
      .returning();
    return { review: toReview(row!), regenerated: true };
  }
  const [row] = await ctx.tx
    .insert(reviews)
    .values({
      id: randomUUID(),
      kind: p.kind,
      key: period.key,
      periodStart: period.start,
      periodEnd: period.end,
      inputsHash,
      computed,
      draft,
      owner: { wins: "", challenges: "", nextFocus: "", notes: "" },
      generatedAt: ctx.now,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { review: toReview(row!), regenerated: false };
}

async function lockReview(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(reviews).where(eq(reviews.id, id)).for("update");
  return assertVersion(row, expectedVersion, "review", id, toReview, "검토");
}

export async function reviewUpdate(ctx: CommandContext, p: P<"review.update">): R<"review.update"> {
  const row = await lockReview(ctx, p.reviewId, p.expectedVersion);
  if (row.status === "finalized") throw invalidTransition("확정된 검토는 수정할 수 없습니다.");
  const [updated] = await ctx.tx
    .update(reviews)
    .set({ owner: { ...row.owner, ...p.owner }, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(reviews.id, row.id))
    .returning();
  return { review: toReview(updated!) };
}

export async function reviewFinalize(ctx: CommandContext, p: P<"review.finalize">): R<"review.finalize"> {
  const row = await lockReview(ctx, p.reviewId, p.expectedVersion);
  if (row.status === "finalized") throw invalidTransition("이미 확정된 검토입니다.");
  const [updated] = await ctx.tx
    .update(reviews)
    .set({ status: "finalized", finalizedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(reviews.id, row.id))
    .returning();
  return { review: toReview(updated!) };
}
