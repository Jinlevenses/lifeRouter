import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  ASSET_CATEGORIES,
  BASE_CURRENCY,
  type AccountCategory,
  type CommandPayload,
  type CommandResultMap,
  type NetWorthSummary,
} from "@liferoute/contracts";
import { computeNetWorth, snapshotAmountKrw } from "@liferoute/core";
import { accounts, balanceSnapshots } from "../db/schema";
import { DomainError, notFound } from "../errors";
import { toAccount, toSnapshot } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

const isAssetCategory = (c: AccountCategory) => (ASSET_CATEGORIES as readonly string[]).includes(c);

function liabilityAlwaysIncluded(): DomainError {
  return new DomainError(
    "LIABILITY_ALWAYS_INCLUDED",
    "부채는 항상 순자산에서 차감됩니다. 상환이 끝났다면 계좌를 보관(사유 입력)하세요.",
  );
}

async function lockAccount(ctx: CommandContext, accountId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
  return assertVersion(row, expectedVersion, "account", accountId, toAccount, "계좌");
}

export async function netWorthNow(ctx: CommandContext): Promise<NetWorthSummary> {
  // Sequential: a transaction owns a single connection.
  const accountRows = await ctx.tx.select().from(accounts);
  const snapshotRows = await ctx.tx.select().from(balanceSnapshots);
  return computeNetWorth({
    accounts: accountRows.map(toAccount),
    snapshots: snapshotRows.map(toSnapshot),
    today: ctx.today,
    finance: ctx.settings.finance,
    timeZone: ctx.settings.timezone,
  });
}

export async function accountCreate(ctx: CommandContext, p: P<"account.create">): R<"account.create"> {
  if (p.kind === "liability" && (!p.included || p.liquid)) throw liabilityAlwaysIncluded();
  const [max] = await ctx.tx.select({ v: sql<number>`coalesce(max(${accounts.sortOrder}), 0)` }).from(accounts);
  const [row] = await ctx.tx
    .insert(accounts)
    .values({
      id: p.id ?? randomUUID(),
      name: p.name.trim(),
      kind: p.kind,
      category: p.category,
      institution: p.institution,
      currency: p.currency,
      included: p.kind === "liability" ? true : p.included,
      liquid: p.kind === "liability" ? false : p.liquid,
      memo: p.memo,
      sortOrder: Number(max?.v ?? 0) + 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { account: toAccount(row!) };
}

export async function accountUpdate(ctx: CommandContext, p: P<"account.update">): R<"account.update"> {
  const row = await lockAccount(ctx, p.accountId, p.expectedVersion);
  const patch = p.patch;
  if (row.kind === "liability" && (patch.included === false || patch.liquid === true)) throw liabilityAlwaysIncluded();
  if (patch.category && (row.kind === "asset") !== isAssetCategory(patch.category)) {
    throw new DomainError("VALIDATION_FAILED", "자산/부채 종류와 맞지 않는 분류입니다.");
  }
  const [updated] = await ctx.tx
    .update(accounts)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}), updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(accounts.id, row.id))
    .returning();
  return { account: toAccount(updated!) };
}

export async function accountArchive(ctx: CommandContext, p: P<"account.archive">): R<"account.archive"> {
  const row = await lockAccount(ctx, p.accountId, p.expectedVersion);
  if (row.archivedAt) throw new DomainError("STATE_TRANSITION_INVALID", "이미 보관된 계좌입니다.");
  const [updated] = await ctx.tx
    .update(accounts)
    .set({ archivedAt: ctx.now, archiveReason: p.reason.trim(), updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(accounts.id, row.id))
    .returning();
  return { account: toAccount(updated!) };
}

export async function accountRestore(ctx: CommandContext, p: P<"account.restore">): R<"account.restore"> {
  const row = await lockAccount(ctx, p.accountId, p.expectedVersion);
  if (!row.archivedAt) throw new DomainError("STATE_TRANSITION_INVALID", "보관된 계좌가 아닙니다.");
  const [updated] = await ctx.tx
    .update(accounts)
    .set({ archivedAt: null, archiveReason: null, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(accounts.id, row.id))
    .returning();
  return { account: toAccount(updated!) };
}

/** Manual (or provider) balance snapshot. Never overwritten silently: same day needs replace=true. */
export async function snapshotAdd(ctx: CommandContext, p: P<"snapshot.add">): R<"snapshot.add"> {
  const [account] = await ctx.tx.select().from(accounts).where(eq(accounts.id, p.accountId));
  if (!account) throw notFound("계좌");
  if (account.archivedAt) throw new DomainError("ACCOUNT_ARCHIVED", "보관된 계좌에는 잔액을 추가할 수 없습니다.");
  if (p.asOf > ctx.today) throw new DomainError("VALIDATION_FAILED", "미래 날짜의 잔액은 기록할 수 없습니다.");
  if (p.estimated && !(p.reason ?? "").trim()) {
    throw new DomainError("ESTIMATE_REASON_REQUIRED", "추정값에는 이유가 필요합니다.");
  }
  if (account.currency !== BASE_CURRENCY && p.fxRate === null) {
    throw new DomainError("FX_RATE_REQUIRED", `${account.currency} 잔액에는 환율(1${account.currency}당 원)이 필요합니다.`);
  }
  const fxRate = account.currency === BASE_CURRENCY ? null : p.fxRate;
  const values = {
    amount: p.amount,
    currency: account.currency,
    fxRate,
    amountKrw: snapshotAmountKrw(p.amount, account.currency, fxRate),
    estimated: p.estimated,
    reason: p.reason?.trim() || null,
    source: "manual" as const,
  };
  const [existing] = await ctx.tx
    .select()
    .from(balanceSnapshots)
    .where(and(eq(balanceSnapshots.accountId, p.accountId), eq(balanceSnapshots.asOf, p.asOf)))
    .for("update");
  let row;
  if (existing) {
    if (!p.replace) {
      throw new DomainError(
        "SNAPSHOT_EXISTS",
        "그 날짜의 잔액이 이미 있습니다.",
        { snapshot: toSnapshot(existing) },
        "교체하려면 '같은 날짜 교체'를 선택하세요.",
      );
    }
    [row] = await ctx.tx.update(balanceSnapshots).set(values).where(eq(balanceSnapshots.id, existing.id)).returning();
  } else {
    [row] = await ctx.tx
      .insert(balanceSnapshots)
      .values({ id: p.id ?? randomUUID(), accountId: p.accountId, asOf: p.asOf, createdAt: ctx.now, ...values })
      .returning();
  }
  return { snapshot: toSnapshot(row!), netWorth: await netWorthNow(ctx) };
}

export async function snapshotDelete(ctx: CommandContext, p: P<"snapshot.delete">): R<"snapshot.delete"> {
  const removed = await ctx.tx.delete(balanceSnapshots).where(eq(balanceSnapshots.id, p.snapshotId)).returning();
  if (removed.length === 0) throw notFound("잔액 기록");
  return { snapshotId: p.snapshotId, netWorth: await netWorthNow(ctx) };
}
