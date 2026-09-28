import { getDb } from "@liferoute/server/db";
import { DomainError, storeAttachment } from "@liferoute/server";
import { ATTACHMENT_MAX_BYTES } from "@liferoute/contracts";
import { assertSameOrigin, clientKey, handle, json, limit, requireOwner } from "@/server/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/attachments (multipart "file") — used by the note editor and web receipt upload. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    assertSameOrigin(request);
    limit("capture", clientKey(request));
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > ATTACHMENT_MAX_BYTES + 64 * 1024)
      throw new DomainError("ATTACHMENT_REJECTED", "파일이 너무 큽니다 (최대 20MB).");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new DomainError("VALIDATION_FAILED", "file 필드가 필요합니다.");
    const attachment = await storeAttachment(getDb(), {
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      clientSha256: typeof form?.get("sha256") === "string" ? String(form.get("sha256")) : null,
    });
    return json({ ok: true, attachment }, 201);
  });
}
