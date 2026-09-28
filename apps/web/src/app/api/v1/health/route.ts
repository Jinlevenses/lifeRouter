import { sql } from "drizzle-orm";
import { getDb } from "@liferoute/server/db";
import { CONTRACT_VERSION } from "@liferoute/contracts";
import { opsState } from "@liferoute/server/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/v1/health — for Docker/uptime checks. No personal data. */
export async function GET() {
  let db = false;
  let worker = false;
  let lastBackupAt: string | null = null;
  try {
    const database = getDb();
    await database.execute(sql`select 1`);
    db = true;
    const rows = await database
      .select()
      .from(opsState)
      .where(inArray(opsState.key, ["worker.heartbeat", "backup.last"]));
    for (const r of rows) {
      const value = r.value as { at?: string | null };
      if (r.key === "worker.heartbeat" && value.at) worker = Date.now() - Date.parse(value.at) < 3 * 60_000;
      if (r.key === "backup.last") lastBackupAt = value.at ?? null;
    }
  } catch {
    db = false;
  }
  return Response.json(
    { ok: db, db, worker, contractVersion: CONTRACT_VERSION, lastBackupAt },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
