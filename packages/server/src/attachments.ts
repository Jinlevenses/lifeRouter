import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { ATTACHMENT_ALLOWED_MIME, ATTACHMENT_MAX_BYTES, type Attachment } from "@liferoute/contracts";
import type { DbOrTx } from "./db/client";
import { attachments } from "./db/schema";
import { DomainError, notFound } from "./errors";
import { toAttachment } from "./mappers";
import { attachmentPath } from "./storage";

type AllowedMime = (typeof ATTACHMENT_ALLOWED_MIME)[number];

/**
 * Attachments (review D-37, SEC-ATTACH-001): size limit, MIME decided by magic bytes (not the
 * client's claim), sha256 computed on the server, content-addressed storage outside the repo.
 */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const b = bytes;
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (
    b.length >= 12 &&
    ascii(4, 8) === "ftyp" &&
    /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(8, 12))
  ) {
    return "image/heic";
  }
  if (isPlainText(b)) return "text/plain";
  return null;
}

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function rejected(message: string): DomainError {
  return new DomainError("ATTACHMENT_REJECTED", message);
}

export async function storeAttachment(
  db: DbOrTx,
  input: { bytes: Uint8Array; originalName: string; clientSha256?: string | null; now?: Date },
): Promise<Attachment> {
  if (input.bytes.length === 0) throw rejected("빈 파일입니다.");
  if (input.bytes.length > ATTACHMENT_MAX_BYTES) throw rejected("파일이 너무 큽니다 (최대 20MB).");
  const mime = sniffMime(input.bytes);
  if (!mime) throw rejected("지원하지 않는 파일 형식입니다 (JPEG, PNG, HEIC, WebP, PDF, 텍스트).");
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (input.clientSha256 && input.clientSha256.toLowerCase() !== sha256)
    throw rejected("파일 해시가 일치하지 않습니다.");

  const [existing] = await db.select().from(attachments).where(eq(attachments.sha256, sha256));
  if (existing) return toAttachment(existing);

  const path = attachmentPath(sha256);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, input.bytes, { mode: 0o600 });
  await rename(tmp, path);

  // Strip control characters and path separators from the stored display name.
  // eslint-disable-next-line no-control-regex
  const name = input.originalName.replace(/[\u0000-\u001f\\/]+/g, "_").slice(0, 255) || "file";
  const [row] = await db
    .insert(attachments)
    .values({
      id: randomUUID(),
      sha256,
      mime,
      size: input.bytes.length,
      originalName: name,
      createdAt: input.now ?? new Date(),
    })
    .onConflictDoNothing({ target: attachments.sha256 })
    .returning();
  if (row) return toAttachment(row);
  const [raced] = await db.select().from(attachments).where(eq(attachments.sha256, sha256));
  return toAttachment(raced!);
}

export async function readAttachment(
  db: DbOrTx,
  id: string,
): Promise<{ attachment: Attachment; bytes: Buffer }> {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!row) throw notFound("첨부 파일");
  const bytes = await readFile(attachmentPath(row.sha256)).catch(() => {
    throw notFound("첨부 파일");
  });
  return { attachment: toAttachment(row), bytes };
}
