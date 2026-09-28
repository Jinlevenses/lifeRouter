import { getDb } from "@liferoute/server/db";
import { DomainError, capture, getIntegrations, verifyCaptureToken } from "@liferoute/server";
import { ATTACHMENT_MAX_BYTES } from "@liferoute/contracts";
import { assertSameOrigin, handle, json, limit, requireOwner } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/capture (docs/09_capture). Two ways in:
 *  - iPhone Share Sheet / Shortcuts with a capture-scoped bearer token (no cookies, no CSRF surface);
 *  - the web app with the owner session + same-origin check (image/receipt uploads, source "web").
 * Body: JSON, or multipart with "file" plus fields (kind, text, url, source, sha256).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const db = getDb();
    let who: string;
    let source: "web" | undefined;
    if (request.headers.get("authorization")) {
      who = (await verifyCaptureToken(db, request.headers.get("authorization"))).tokenId;
    } else {
      who = (await requireOwner(request)).userId;
      assertSameOrigin(request);
      source = "web";
    }
    limit("capture", who);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > ATTACHMENT_MAX_BYTES + 64 * 1024)
      throw new DomainError("ATTACHMENT_REJECTED", "파일이 너무 큽니다 (최대 20MB).");
    const type = request.headers.get("content-type") ?? "";
    let fields: Record<string, unknown>;
    let file: { bytes: Uint8Array; name: string } | null = null;
    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      fields = {};
      for (const [k, v] of form.entries()) {
        if (v instanceof File) file = { bytes: new Uint8Array(await v.arrayBuffer()), name: v.name };
        else if (v !== "") fields[k] = v;
      }
      if (!fields.kind) fields.kind = file ? "image" : fields.url ? "url" : "text";
    } else {
      fields = ((await request.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
    }
    return json(await capture(db, await getIntegrations(), { fields, file, source }), 201);
  });
}
