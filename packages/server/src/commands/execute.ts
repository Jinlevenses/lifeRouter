import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  AI_FORBIDDEN_COMMAND_PREFIXES,
  CommandSchema,
  TIMEZONE,
  type CommandOk,
  type CommandResponse,
  type CommandType,
} from "@liferoute/contracts";
import { stableStringify, todayInZone } from "@liferoute/core";
import type { Db } from "../db/client";
import { commandLog, settings } from "../db/schema";
import { DomainError, internalError, isUniqueViolation, validationFailed } from "../errors";
import type { Integrations } from "../integrations";
import type { JobQueue } from "../jobs";
import { log } from "../logger";
import { toSettings } from "../mappers";
import { ensureSeeded } from "../seed";
import type { Actor, CommandContext } from "./context";
import { handlers, type HandlerMap } from "./index";

export interface ExecuteDeps {
  db: Db;
  jobs: JobQueue;
  integrations: Integrations;
  now?: () => Date;
}

export interface ExecuteOutcome {
  status: number;
  body: CommandResponse;
}

const seeded = new WeakSet<object>();

/**
 * The single write path (docs/02_architecture, docs/04_api): schema → actor permission →
 * idempotency → handler inside one transaction (versions checked under row locks) →
 * idempotency record in the same transaction → post-commit jobs.
 */
export async function executeCommand(
  deps: ExecuteDeps,
  raw: unknown,
  actor: Actor = "owner",
): Promise<ExecuteOutcome> {
  const parsed = CommandSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      validationFailed(parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message }))),
    );
  }
  const command = parsed.data;
  if (actor === "ai" && AI_FORBIDDEN_COMMAND_PREFIXES.some((prefix) => command.type.startsWith(prefix))) {
    return fail(new DomainError("FORBIDDEN", "AI는 이 작업을 할 수 없습니다."));
  }

  const now = deps.now?.() ?? new Date();
  const today = todayInZone(TIMEZONE, now);
  const key = command.idempotencyKey;
  const payloadHash = createHash("sha256")
    .update(stableStringify({ type: command.type, payload: command.payload }))
    .digest("hex");

  if (key) {
    const replay = await findReplay(deps.db, key, payloadHash);
    if (replay) return replay;
  }

  if (!seeded.has(deps.db)) {
    await ensureSeeded(deps.db, today);
    seeded.add(deps.db);
  }

  const after: (() => Promise<void>)[] = [];
  try {
    const body = await deps.db.transaction(async (tx) => {
      const [settingsRow] = await tx.select().from(settings).where(eq(settings.id, "settings"));
      const ctx: CommandContext = {
        tx,
        now,
        today,
        settings: toSettings(settingsRow!),
        actor,
        jobs: deps.jobs,
        integrations: deps.integrations,
        afterCommit: (fn) => after.push(fn),
      };
      const handler = handlers[command.type] as HandlerMap[CommandType] as (
        c: CommandContext,
        p: unknown,
      ) => Promise<unknown>;
      const result = await handler(ctx, command.payload);
      const ok = {
        ok: true,
        commandId: randomUUID(),
        type: command.type,
        result,
        replayed: false,
        completedAt: now.toISOString(),
      } as CommandOk;
      if (key) {
        await tx.insert(commandLog).values({
          idempotencyKey: key,
          commandId: ok.commandId,
          commandType: command.type,
          payloadHash,
          statusCode: 200,
          response: ok,
          createdAt: now,
        });
      }
      return ok;
    });
    for (const fn of after) {
      try {
        await fn();
      } catch (error) {
        // The command is committed; the worker's sweep re-enqueues anything left behind.
        log.error("command.after_commit_failed", error, { type: command.type });
      }
    }
    return { status: 200, body };
  } catch (error) {
    if (key && isUniqueViolation(error, "command_log_pkey")) {
      const replay = await findReplay(deps.db, key, payloadHash);
      if (replay) return replay;
    }
    if (error instanceof DomainError) return fail(error);
    if (isUniqueViolation(error, "snapshots_account_asof_uq")) {
      return fail(new DomainError("SNAPSHOT_EXISTS", "그 날짜의 잔액이 이미 있습니다."));
    }
    if (isUniqueViolation(error, "tasks_top_slot_uq")) {
      return fail(new DomainError("TOP_RANK_TAKEN", "그 순위는 이미 다른 할 일이 차지하고 있습니다."));
    }
    log.error("command.failed", error, { type: command.type });
    return fail(internalError());
  }
}

async function findReplay(db: Db, key: string, payloadHash: string): Promise<ExecuteOutcome | null> {
  const [existing] = await db.select().from(commandLog).where(eq(commandLog.idempotencyKey, key));
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash) {
    return fail(
      new DomainError(
        "IDEMPOTENCY_MISMATCH",
        "같은 요청 키로 다른 내용을 보냈습니다.",
        undefined,
        "새 요청으로 다시 시도하세요.",
      ),
    );
  }
  return { status: existing.statusCode, body: { ...(existing.response as CommandOk), replayed: true } };
}

function fail(error: DomainError): ExecuteOutcome {
  return { status: error.status, body: error.toBody() };
}
