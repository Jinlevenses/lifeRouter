import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { CaptureRequestSchema, type CaptureResponse } from "@liferoute/contracts";
import { emptyReceiptFields } from "@liferoute/core";
import { storeAttachment } from "./attachments";
import type { Db } from "./db/client";
import { apiTokens, inboxItems, receipts } from "./db/schema";
import { DomainError, validationFailed } from "./errors";
import type { Integrations } from "./integrations";
import { toInboxItem, toReceipt } from "./mappers";

/**
 * iPhone Share Sheet / Shortcuts capture (FR-007, review D-34/D-35).
 * Authenticated by a capture-scoped bearer token; valid for this endpoint only.
 */
export async function verifyCaptureToken(db: Db, authorization: string | null): Promise<{ tokenId: string }> {
  const match = /^Bearer\s+(lrc_[A-Za-z0-9_-]{20,})$/.exec(authorization ?? "");
  if (!match) throw new DomainError("UNAUTHORIZED", "캡처 토큰이 필요합니다.");
  const hash = createHash("sha256").update(match[1]!).digest("hex");
  const [token] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)));
  if (!token || token.scope !== "capture")
    throw new DomainError("UNAUTHORIZED", "유효하지 않은 캡처 토큰입니다.");
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, token.id));
  return { tokenId: token.id };
}

export interface CaptureInput {
  fields: Record<string, unknown>;
  file: { bytes: Uint8Array; name: string } | null;
}

export async function capture(
  db: Db,
  integrations: Integrations,
  input: CaptureInput & { source?: "web" },
  now = new Date(),
): Promise<CaptureResponse> {
  const parsed = CaptureRequestSchema.safeParse(input.fields);
  if (!parsed.success)
    throw validationFailed(
      parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
    );
  // Web uploads (owner session) are recorded as "web"; token captures keep their declared source.
  const req = { ...parsed.data, source: input.source ?? parsed.data.source };
  const needsFile = req.kind === "image" || req.kind === "receipt";
  if (needsFile && !input.file)
    throw validationFailed([{ path: "file", message: "이미지 파일이 필요합니다." }]);

  const attachment = input.file
    ? await storeAttachment(db, {
        bytes: input.file.bytes,
        originalName: input.file.name,
        clientSha256: req.sha256,
        now,
      })
    : null;
  if (
    needsFile &&
    attachment &&
    !attachment.mime.startsWith("image/") &&
    attachment.mime !== "application/pdf"
  ) {
    throw new DomainError("ATTACHMENT_REJECTED", "이미지 또는 PDF만 영수증/이미지로 받을 수 있습니다.");
  }

  return db.transaction(async (tx) => {
    const itemId = randomUUID();
    const [item] = await tx
      .insert(inboxItems)
      .values({
        id: itemId,
        kind: req.kind,
        text: req.text?.trim() || null,
        url: req.url ?? null,
        attachmentId: attachment?.id ?? null,
        source: req.source,
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (req.kind !== "receipt")
      return { ok: true as const, item: toInboxItem(item!), attachment, receipt: null };

    // Receipts become drafts right away; nothing is confirmed without the owner (docs/09_capture).
    const [receipt] = await tx
      .insert(receipts)
      .values({
        id: randomUUID(),
        inboxItemId: itemId,
        attachmentId: attachment!.id,
        ocr: {
          status: integrations.ocr.available ? "pending" : "unavailable",
          engine: integrations.ocr.available ? integrations.ocr.name : null,
          rawText: null,
          finishedAt: null,
          error: null,
        },
        fields: emptyReceiptFields(),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const [converted] = await tx
      .update(inboxItems)
      .set({ status: "converted", convertedType: "receipt", convertedId: receipt!.id, updatedAt: now })
      .where(eq(inboxItems.id, itemId))
      .returning();
    return { ok: true as const, item: toInboxItem(converted!), attachment, receipt: toReceipt(receipt!) };
  });
}
