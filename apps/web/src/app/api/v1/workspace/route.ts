import { getDb } from "@liferoute/server/db";
import { loadWorkspace } from "@liferoute/server";
import { clientKey, handle, json, limit, requireOwner } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    limit("reads", clientKey(request));
    return json(await loadWorkspace(getDb()));
  });
}
