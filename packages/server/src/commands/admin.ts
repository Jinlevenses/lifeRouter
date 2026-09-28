import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { JOB_NAMES, SettingsSchema, type CommandPayload, type CommandResultMap } from "@liferoute/contracts";
import { apiTokens, connections, guidanceSources, settings } from "../db/schema";
import { DomainError, notFound, validationFailed, versionConflict } from "../errors";
import { toApiToken, toConnection, toGuidance, toSettings } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

export async function settingsUpdate(ctx: CommandContext, p: P<"settings.update">): R<"settings.update"> {
  const [row] = await ctx.tx.select().from(settings).where(eq(settings.id, "settings")).for("update");
  if (!row) throw notFound("설정");
  if (row.version !== p.expectedVersion) {
    throw versionConflict("settings", "settings", p.expectedVersion, row.version, toSettings(row));
  }
  const next = {
    finance: { ...row.finance, ...p.patch.finance },
    ai: { ...row.ai, ...p.patch.ai },
    backup: { ...row.backup, ...p.patch.backup, retention: { ...row.backup.retention, ...p.patch.backup?.retention } },
    capture: { ...row.capture, ...p.patch.capture },
  };
  const parsed = SettingsSchema.safeParse({ ...toSettings(row), ...next });
  if (!parsed.success) {
    throw validationFailed(parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })));
  }
  const [updated] = await ctx.tx
    .update(settings)
    .set({ ...next, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(settings.id, "settings"))
    .returning();
  return { settings: toSettings(updated!) };
}

async function connectionFor(ctx: CommandContext, provider: "google" | "toss" | "ai") {
  const [row] = await ctx.tx.select().from(connections).where(eq(connections.provider, provider)).for("update");
  if (!row) throw notFound("연결");
  return row;
}

export async function connectionDisconnect(ctx: CommandContext, p: P<"connection.disconnect">): R<"connection.disconnect"> {
  const row = await connectionFor(ctx, p.provider);
  const [updated] = await ctx.tx
    .update(connections)
    .set({
      status: "disconnected",
      secret: null,
      syncState: {},
      scopes: [],
      lastError: null,
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(connections.id, row.id))
    .returning();
  return { connection: toConnection(updated!) };
}

export async function connectionSyncNow(ctx: CommandContext, p: P<"connection.syncNow">): R<"connection.syncNow"> {
  const row = await connectionFor(ctx, p.provider);
  const adapterReady = p.provider === "google" ? ctx.integrations.calendar.available : ctx.integrations.balance.available;
  if (!adapterReady || row.status === "disconnected" || row.status === "reauth_required") {
    throw new DomainError(
      "INTEGRATION_DISCONNECTED",
      row.status === "reauth_required" ? "다시 로그인(재동의)이 필요합니다." : "연결되어 있지 않습니다.",
      undefined,
      "설정 > 연결에서 계정을 연결하세요.",
    );
  }
  const job = p.provider === "google" ? JOB_NAMES.googleSync : JOB_NAMES.tossSync;
  ctx.afterCommit(async () => {
    await ctx.jobs.send(job, { reason: "manual" }, { singletonKey: p.provider });
  });
  return { connection: toConnection(row), jobQueued: true };
}

/** Capture token for iPhone Shortcuts: the secret is shown once; only its sha256 is stored (review D-34). */
export async function tokenCreate(ctx: CommandContext, p: P<"token.create">): R<"token.create"> {
  const secret = `lrc_${randomBytes(32).toString("base64url")}`;
  const [row] = await ctx.tx
    .insert(apiTokens)
    .values({
      id: randomUUID(),
      label: p.label.trim(),
      scope: p.scope,
      prefix: secret.slice(0, 8),
      tokenHash: createHash("sha256").update(secret).digest("hex"),
      createdAt: ctx.now,
    })
    .returning();
  return { token: toApiToken(row!), secret };
}

export async function tokenRevoke(ctx: CommandContext, p: P<"token.revoke">): R<"token.revoke"> {
  const [row] = await ctx.tx
    .update(apiTokens)
    .set({ revokedAt: ctx.now })
    .where(eq(apiTokens.id, p.tokenId))
    .returning();
  if (!row) throw notFound("토큰");
  return { token: toApiToken(row) };
}

export async function backupRunNow(ctx: CommandContext): R<"backup.runNow"> {
  ctx.afterCommit(async () => {
    await ctx.jobs.send(JOB_NAMES.backupDaily, { reason: "manual" }, { singletonKey: "backup" });
  });
  return { jobQueued: true };
}

export async function guidanceUpsert(ctx: CommandContext, p: P<"guidance.upsert">): R<"guidance.upsert"> {
  const values = {
    topic: p.topic,
    title: p.title.trim(),
    sourceUrl: p.sourceUrl,
    checkedAt: p.checkedAt,
    effectiveDate: p.effectiveDate,
    summary: p.summary,
    // No owner profile exists in v1, so eligibility is always unknown (review D-52).
    eligibility: "unknown" as const,
  };
  if (p.id) {
    const [existing] = await ctx.tx.select().from(guidanceSources).where(eq(guidanceSources.id, p.id)).for("update");
    if (existing) {
      if (p.expectedVersion === undefined) {
        throw new DomainError("VALIDATION_FAILED", "기존 안내를 수정하려면 expectedVersion이 필요합니다.");
      }
      assertVersion({ ...existing, deletedAt: null }, p.expectedVersion, "guidance", existing.id, toGuidance, "안내");
      const [row] = await ctx.tx
        .update(guidanceSources)
        .set({ ...values, updatedAt: ctx.now, version: sql`version + 1` })
        .where(eq(guidanceSources.id, existing.id))
        .returning();
      return { guidance: toGuidance(row!) };
    }
  }
  const [row] = await ctx.tx
    .insert(guidanceSources)
    .values({ id: p.id ?? randomUUID(), ...values, createdAt: ctx.now, updatedAt: ctx.now })
    .returning();
  return { guidance: toGuidance(row!) };
}

export async function guidanceDelete(ctx: CommandContext, p: P<"guidance.delete">): R<"guidance.delete"> {
  const [existing] = await ctx.tx.select().from(guidanceSources).where(eq(guidanceSources.id, p.guidanceId)).for("update");
  assertVersion(existing ? { ...existing, deletedAt: null } : undefined, p.expectedVersion, "guidance", p.guidanceId, toGuidance, "안내");
  const [row] = await ctx.tx.delete(guidanceSources).where(eq(guidanceSources.id, p.guidanceId)).returning();
  return { guidance: toGuidance(row!) };
}
