import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { CollectionProperty, CommandPayload, CommandResultMap, PropertyValue } from "@liferoute/contracts";
import { pruneValues, validateRecordValues, validateViews } from "@liferoute/core";
import { collectionRecords, collections } from "../db/schema";
import { notFound, validationFailed } from "../errors";
import { toCollection, toRecord } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

async function lockCollection(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(collections).where(eq(collections.id, id)).for("update");
  return assertVersion(row, expectedVersion, "collection", id, toCollection, "컬렉션");
}

async function requireCollection(ctx: CommandContext, id: string) {
  const [row] = await ctx.tx.select().from(collections).where(eq(collections.id, id));
  if (!row || row.deletedAt) throw notFound("컬렉션");
  return row;
}

async function checkValues(ctx: CommandContext, properties: CollectionProperty[], values: Record<string, PropertyValue>) {
  const relationIds = new Set<string>();
  for (const v of Object.values(values)) if (v.type === "relation") v.value.forEach((id) => relationIds.add(id));
  const existing = new Set<string>();
  if (relationIds.size > 0) {
    const rows = await ctx.tx
      .select({ id: collectionRecords.id, collectionId: collectionRecords.collectionId })
      .from(collectionRecords)
      .where(and(inArray(collectionRecords.id, [...relationIds]), isNull(collectionRecords.deletedAt)));
    for (const r of rows) existing.add(`${r.collectionId}:${r.id}`);
  }
  const issues = validateRecordValues(properties, values, (collectionId, recordId) => existing.has(`${collectionId}:${recordId}`));
  if (issues.length > 0) throw validationFailed(issues);
}

export async function collectionCreate(ctx: CommandContext, p: P<"collection.create">): R<"collection.create"> {
  const issues = validateViews(p.properties, p.views);
  if (issues.length > 0) throw validationFailed(issues);
  const [row] = await ctx.tx
    .insert(collections)
    .values({
      id: p.id ?? randomUUID(),
      name: p.name.trim(),
      icon: p.icon,
      properties: p.properties,
      views: p.views,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { collection: toCollection(row!) };
}

export async function collectionUpdate(ctx: CommandContext, p: P<"collection.update">): R<"collection.update"> {
  const current = await lockCollection(ctx, p.collectionId, p.expectedVersion);
  const properties = p.patch.properties ?? current.properties;
  const views = p.patch.views ?? current.views;
  const issues = validateViews(properties, views);
  if (issues.length > 0) throw validationFailed(issues);
  const [row] = await ctx.tx
    .update(collections)
    .set({
      ...(p.patch.name !== undefined ? { name: p.patch.name.trim() } : {}),
      ...(p.patch.icon !== undefined ? { icon: p.patch.icon } : {}),
      properties,
      views,
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(collections.id, p.collectionId))
    .returning();
  if (p.patch.properties) {
    // Drop values of removed (or retyped) properties; touched records bump their version.
    const records = await ctx.tx.select().from(collectionRecords).where(eq(collectionRecords.collectionId, p.collectionId));
    for (const record of records) {
      const pruned = pruneValues(properties, record.values);
      if (Object.keys(pruned).length !== Object.keys(record.values).length) {
        await ctx.tx
          .update(collectionRecords)
          .set({ values: pruned, updatedAt: ctx.now, version: sql`version + 1` })
          .where(eq(collectionRecords.id, record.id));
      }
    }
  }
  return { collection: toCollection(row!) };
}

export async function collectionDelete(ctx: CommandContext, p: P<"collection.delete">): R<"collection.delete"> {
  await lockCollection(ctx, p.collectionId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(collections)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(collections.id, p.collectionId))
    .returning();
  await ctx.tx
    .update(collectionRecords)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(and(eq(collectionRecords.collectionId, p.collectionId), isNull(collectionRecords.deletedAt)));
  return { collection: toCollection(row!) };
}

export async function recordCreate(ctx: CommandContext, p: P<"collection.record.create">): R<"collection.record.create"> {
  const collection = await requireCollection(ctx, p.collectionId);
  await checkValues(ctx, collection.properties, p.values);
  const [max] = await ctx.tx
    .select({ v: sql<number>`coalesce(max(${collectionRecords.sortOrder}), 0)` })
    .from(collectionRecords)
    .where(eq(collectionRecords.collectionId, p.collectionId));
  const [row] = await ctx.tx
    .insert(collectionRecords)
    .values({
      id: p.id ?? randomUUID(),
      collectionId: p.collectionId,
      values: p.values,
      sortOrder: Number(max?.v ?? 0) + 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { record: toRecord(row!) };
}

async function lockRecord(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(collectionRecords).where(eq(collectionRecords.id, id)).for("update");
  return assertVersion(row, expectedVersion, "collectionRecord", id, toRecord, "레코드");
}

export async function recordUpdate(ctx: CommandContext, p: P<"collection.record.update">): R<"collection.record.update"> {
  const current = await lockRecord(ctx, p.recordId, p.expectedVersion);
  const collection = await requireCollection(ctx, current.collectionId);
  await checkValues(ctx, collection.properties, p.values);
  const [row] = await ctx.tx
    .update(collectionRecords)
    .set({
      values: p.values,
      ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(collectionRecords.id, p.recordId))
    .returning();
  return { record: toRecord(row!) };
}

export async function recordDelete(ctx: CommandContext, p: P<"collection.record.delete">): R<"collection.record.delete"> {
  await lockRecord(ctx, p.recordId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(collectionRecords)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(collectionRecords.id, p.recordId))
    .returning();
  return { record: toRecord(row!) };
}
