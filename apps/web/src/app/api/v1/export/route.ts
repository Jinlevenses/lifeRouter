import { getDb } from "@liferoute/server/db";
import { createExport } from "@liferoute/server";
import { handle, requireOwner } from "@/server/http";
import { contentDisposition } from "@/server/params";

export const dynamic = "force-dynamic";

/** GET /api/v1/export — owner-requested portable copy (JSON + Markdown + attachments), no credentials. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    const { zip, fileName } = await createExport(getDb());
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition("attachment", fileName),
        "cache-control": "no-store",
      },
    });
  });
}
