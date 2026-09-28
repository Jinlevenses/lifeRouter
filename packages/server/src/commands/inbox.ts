import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { JOB_NAMES, type CommandPayload, type CommandResultMap } from "@liferoute/contracts";
import { applyOwnerFields, canTransition, emptyReceiptFields, textToDocument } from "@liferoute/core";
import { inboxItems, receipts } from "../db/schema";
import { DomainError, invalidTransition, notFound } from "../errors";
import { toInboxItem, toReceipt } from "../mappers";
import { assertVersion, type CommandContext } from "./context";
import { noteCreate } from "./notes";
import { taskCreate } from "./plan";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

/**
 * Inbox (FR-007, docs/09_capture, review D-35/D-36): new → converted | archived only.
 * Conversion keeps the link between the capture and what it became.
 */
export async function inboxCreate(ctx: CommandContext, p: P<"inbox.create">): R<"inbox.create"> {
  const [row] = await ctx.tx
    .insert(inboxItems)
    .values({
      id: p.id ?? randomUUID(),
      kind: p.kind,
      text: p.text?.trim() || null,
      url: p.url,
      source: "web",
      capturedAt: ctx.now,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { item: toInboxItem(row!) };
}

async function lockItem(ctx: CommandContext, itemId: string) {
  const [row] = await ctx.tx.select().from(inboxItems).where(eq(inboxItems.id, itemId)).for("update");
  if (!row) throw notFound("Inbox 항목");
  return row;
}

function firstLine(text: string | null, url: string | null): string {
  const line = (text ?? "")
    .split("\n")
    .find((l) => l.trim())
    ?.trim();
  return (line || url || "캡처한 항목").slice(0, 200);
}

export async function inboxConvert(ctx: CommandContext, p: P<"inbox.convert">): R<"inbox.convert"> {
  const item = await lockItem(ctx, p.itemId);
  if (!canTransition("inbox", item.status, "converted")) throw invalidTransition("이미 처리된 항목입니다.");
  const target = p.target;
  let created: CommandResultMap["inbox.convert"]["created"];
  if (target.type === "task") {
    const { task } = await taskCreate(ctx, {
      title: target.title?.trim() || firstLine(item.text, item.url),
      description: [item.text, item.url].filter(Boolean).join("\n").slice(0, 4000),
      projectId: target.projectId,
      goalId: null,
      dueDate: target.dueDate,
      plannedAt: null,
      plannedDurationMin: null,
      recurrence: null,
    });
    created = { type: "task", task };
  } else if (target.type === "note") {
    const body = [item.text, item.url].filter(Boolean).join("\n");
    const { note } = await noteCreate(ctx, {
      title: target.title?.trim() || firstLine(item.text, item.url),
      document: textToDocument(body),
      tags: [],
      projectId: null,
      goalId: null,
    });
    created = { type: "note", note };
  } else {
    if (!item.attachmentId)
      throw new DomainError("VALIDATION_FAILED", "이미지가 있는 항목만 영수증으로 바꿀 수 있습니다.");
    const [row] = await ctx.tx
      .insert(receipts)
      .values({
        id: randomUUID(),
        inboxItemId: item.id,
        attachmentId: item.attachmentId,
        ocr: {
          status: ctx.integrations.ocr.available ? "pending" : "unavailable",
          engine: ctx.integrations.ocr.available ? ctx.integrations.ocr.name : null,
          rawText: null,
          finishedAt: null,
          error: null,
        },
        fields: emptyReceiptFields(),
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    const receipt = toReceipt(row!);
    if (ctx.integrations.ocr.available) {
      ctx.afterCommit(async () => {
        await ctx.jobs.send(JOB_NAMES.receiptOcr, { receiptId: receipt.id }, { singletonKey: receipt.id });
      });
    }
    created = { type: "receipt", receipt };
  }
  const createdId =
    created.type === "task"
      ? created.task.id
      : created.type === "note"
        ? created.note.id
        : created.receipt.id;
  const [row] = await ctx.tx
    .update(inboxItems)
    .set({ status: "converted", convertedType: created.type, convertedId: createdId, updatedAt: ctx.now })
    .where(eq(inboxItems.id, item.id))
    .returning();
  return { item: toInboxItem(row!), created };
}

export async function inboxArchive(ctx: CommandContext, p: P<"inbox.archive">): R<"inbox.archive"> {
  const item = await lockItem(ctx, p.itemId);
  if (!canTransition("inbox", item.status, "archived")) throw invalidTransition("이미 처리된 항목입니다.");
  const [row] = await ctx.tx
    .update(inboxItems)
    .set({ status: "archived", archivedAt: ctx.now, updatedAt: ctx.now })
    .where(eq(inboxItems.id, item.id))
    .returning();
  return { item: toInboxItem(row!) };
}

// ---------------------------------------------------------------- receipts

async function lockReceipt(ctx: CommandContext, id: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(receipts).where(eq(receipts.id, id)).for("update");
  return assertVersion(row, expectedVersion, "receipt", id, toReceipt, "영수증");
}

function requireDraft(status: string) {
  if (status !== "draft") throw invalidTransition("확인 전(초안) 영수증만 바꿀 수 있습니다.");
}

export async function receiptUpdate(ctx: CommandContext, p: P<"receipt.update">): R<"receipt.update"> {
  const row = await lockReceipt(ctx, p.receiptId, p.expectedVersion);
  requireDraft(row.status);
  const [updated] = await ctx.tx
    .update(receipts)
    .set({ fields: applyOwnerFields(row.fields, p.fields), updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(receipts.id, row.id))
    .returning();
  return { receipt: toReceipt(updated!) };
}

/** Only the owner's explicit confirmation creates a spending record (never OCR alone). */
export async function receiptConfirm(ctx: CommandContext, p: P<"receipt.confirm">): R<"receipt.confirm"> {
  const row = await lockReceipt(ctx, p.receiptId, p.expectedVersion);
  requireDraft(row.status);
  const confirmed = { ...p.confirmed, merchant: p.confirmed.merchant.trim() };
  const [updated] = await ctx.tx
    .update(receipts)
    .set({
      status: "confirmed",
      confirmed,
      confirmedAt: ctx.now,
      fields: applyOwnerFields(row.fields, {
        merchant: confirmed.merchant,
        amount: confirmed.amountKrw,
        currency: "KRW",
        date: confirmed.date,
      }),
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(receipts.id, row.id))
    .returning();
  return { receipt: toReceipt(updated!) };
}

export async function receiptDiscard(ctx: CommandContext, p: P<"receipt.discard">): R<"receipt.discard"> {
  const row = await lockReceipt(ctx, p.receiptId, p.expectedVersion);
  requireDraft(row.status);
  const [updated] = await ctx.tx
    .update(receipts)
    .set({ status: "discarded", updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(receipts.id, row.id))
    .returning();
  return { receipt: toReceipt(updated!) };
}

export async function receiptRequestOcr(
  ctx: CommandContext,
  p: P<"receipt.requestOcr">,
): R<"receipt.requestOcr"> {
  const [row] = await ctx.tx.select().from(receipts).where(eq(receipts.id, p.receiptId)).for("update");
  if (!row) throw notFound("영수증");
  requireDraft(row.status);
  if (!ctx.integrations.ocr.available || !row.attachmentId) {
    throw new DomainError(
      "OCR_UNAVAILABLE",
      "글자 인식(OCR)을 사용할 수 없습니다.",
      undefined,
      "금액·가게·날짜를 직접 입력해 확정하세요.",
    );
  }
  const [updated] = await ctx.tx
    .update(receipts)
    .set({
      ocr: { ...row.ocr, status: "pending", error: null },
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(receipts.id, row.id))
    .returning();
  ctx.afterCommit(async () => {
    await ctx.jobs.send(JOB_NAMES.receiptOcr, { receiptId: row.id }, { singletonKey: row.id });
  });
  return { receipt: toReceipt(updated!), jobQueued: true };
}
