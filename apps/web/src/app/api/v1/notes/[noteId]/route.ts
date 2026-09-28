import { getDb } from "@liferoute/server/db";
import { loadNoteDetail } from "@liferoute/server";
import { IdSchema } from "@liferoute/contracts";
import { handle, json, requireOwner } from "@/server/http";
import { notFoundId } from "@/server/params";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  return handle(async () => {
    await requireOwner(request);
    const { noteId } = await params;
    if (!IdSchema.safeParse(noteId).success) throw notFoundId("노트");
    return json(await loadNoteDetail(getDb(), noteId));
  });
}
