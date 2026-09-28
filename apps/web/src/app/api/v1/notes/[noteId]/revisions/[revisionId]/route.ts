import { getDb } from "@liferoute/server/db";
import { loadRevision } from "@liferoute/server";
import { IdSchema } from "@liferoute/contracts";
import { handle, json, requireOwner } from "@/server/http";
import { notFoundId } from "@/server/params";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ noteId: string; revisionId: string }> },
) {
  return handle(async () => {
    await requireOwner(request);
    const { noteId, revisionId } = await params;
    if (!IdSchema.safeParse(noteId).success || !IdSchema.safeParse(revisionId).success)
      throw notFoundId("이전 버전");
    return json(await loadRevision(getDb(), noteId, revisionId));
  });
}
