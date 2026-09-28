import { executeCommand } from "@liferoute/server";
import { assertSameOrigin, clientKey, handle, json, limit, requireOwner } from "@/server/http";
import { commandDeps } from "@/server/deps";

export const dynamic = "force-dynamic";

/** POST /api/v1/commands — the single typed write path (docs/04_api). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    assertSameOrigin(request);
    limit("commands", clientKey(request));
    const body = await request.json().catch(() => null);
    const outcome = await executeCommand(await commandDeps(), body, "owner");
    return json(outcome.body, outcome.status);
  });
}
