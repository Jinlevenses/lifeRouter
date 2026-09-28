import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { CommandPayload, CommandResultMap } from "@liferoute/contracts";
import { checkIns, routines } from "../db/schema";
import { DomainError, notFound } from "../errors";
import { toCheckIn, toRoutine } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

async function lockRoutine(ctx: CommandContext, routineId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(routines).where(eq(routines.id, routineId)).for("update");
  return assertVersion(row, expectedVersion, "routine", routineId, toRoutine, "루틴");
}

export async function routineCreate(ctx: CommandContext, p: P<"routine.create">): R<"routine.create"> {
  const [max] = await ctx.tx.select({ v: sql<number>`coalesce(max(${routines.sortOrder}), 0)` }).from(routines);
  const [row] = await ctx.tx
    .insert(routines)
    .values({
      id: p.id ?? randomUUID(),
      title: p.title.trim(),
      description: p.description,
      schedule: p.schedule,
      sortOrder: Number(max?.v ?? 0) + 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { routine: toRoutine(row!) };
}

export async function routineUpdate(ctx: CommandContext, p: P<"routine.update">): R<"routine.update"> {
  await lockRoutine(ctx, p.routineId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(routines)
    .set({ ...p.patch, ...(p.patch.title ? { title: p.patch.title.trim() } : {}), updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(routines.id, p.routineId))
    .returning();
  return { routine: toRoutine(row!) };
}

export async function routineDelete(ctx: CommandContext, p: P<"routine.delete">): R<"routine.delete"> {
  await lockRoutine(ctx, p.routineId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(routines)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(routines.id, p.routineId))
    .returning();
  return { routine: toRoutine(row!) };
}

async function requireRoutine(ctx: CommandContext, routineId: string) {
  const [row] = await ctx.tx.select().from(routines).where(eq(routines.id, routineId));
  if (!row || row.deletedAt) throw notFound("루틴");
  return row;
}

/** Upsert on (routineId, date). Recording on a non-expected day is allowed; the future is not. */
export async function checkInRecord(ctx: CommandContext, p: P<"checkin.record">): R<"checkin.record"> {
  await requireRoutine(ctx, p.routineId);
  if (p.date > ctx.today) throw new DomainError("VALIDATION_FAILED", "미래 날짜에는 기록할 수 없습니다.");
  const [row] = await ctx.tx
    .insert(checkIns)
    .values({ id: randomUUID(), routineId: p.routineId, date: p.date, status: p.status, note: p.note, recordedAt: ctx.now })
    .onConflictDoUpdate({
      target: [checkIns.routineId, checkIns.date],
      set: { status: p.status, note: p.note, recordedAt: ctx.now },
    })
    .returning();
  return { checkIn: toCheckIn(row!) };
}

/** Removing the row returns the day to "unrecorded" (never "skipped"). */
export async function checkInClear(ctx: CommandContext, p: P<"checkin.clear">): R<"checkin.clear"> {
  await requireRoutine(ctx, p.routineId);
  const removed = await ctx.tx
    .delete(checkIns)
    .where(and(eq(checkIns.routineId, p.routineId), eq(checkIns.date, p.date)))
    .returning({ id: checkIns.id });
  return { routineId: p.routineId, date: p.date, removed: removed.length > 0 };
}
