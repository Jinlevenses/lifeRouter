import { getDb } from "@liferoute/server/db";
import { noteMarkdown } from "@liferoute/server";
import { IdSchema } from "@liferoute/contracts";
import { handle, requireOwner } from "@/server/http";
import { contentDisposition, notFoundId } from "@/server/params";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  return handle(async () => {
    await requireOwner(request);
    const { noteId } = await params;
    if (!IdSchema.safeParse(noteId).success) throw notFoundId("노트");
    const { filename, markdown } = await noteMarkdown(getDb(), noteId);
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": contentDisposition("attachment", filename),
        "cache-control": "no-store",
      },
    });
  });
}
