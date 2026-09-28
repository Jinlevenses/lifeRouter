import { getDb } from "@liferoute/server/db";
import { readAttachment } from "@liferoute/server";
import { IdSchema } from "@liferoute/contracts";
import { handle, requireOwner } from "@/server/http";
import { contentDisposition, notFoundId } from "@/server/params";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  return handle(async () => {
    await requireOwner(request);
    const { attachmentId } = await params;
    if (!IdSchema.safeParse(attachmentId).success) throw notFoundId("첨부 파일");
    const { attachment, bytes } = await readAttachment(getDb(), attachmentId);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": attachment.mime === "text/plain" ? "text/plain; charset=utf-8" : attachment.mime,
        "content-length": String(bytes.length),
        "content-disposition": contentDisposition(
          download ? "attachment" : "inline",
          attachment.originalName,
        ),
        // Served files can never run script in the app's origin.
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });
}
