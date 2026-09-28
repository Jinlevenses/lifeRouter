import { inArray, sql } from "drizzle-orm";
import { getDb } from "@liferoute/server/db";
import { opsState } from "@liferoute/server/schema";
import { CONTRACT_VERSION } from "@liferoute/contracts";

export const dynamic = "force-dynamic";

/** GET /api/v1/health — for Docker/uptime checks. No personal data. */
export async function GET() {
  let db = false;
  let worker = false;
  let lastBackupAt: string | null = null;
  try {
    await getDb().execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  if (db) {
    try {
      const rows = await getDb()
        .select()
        .from(opsState)
        .where(inArray(opsState.key, ["worker.heartbeat", "backup.last"]));
      for (const r of rows) {
        const value = r.value as { at?: string | null };
        if (r.key === "worker.heartbeat" && value.at) worker = Date.now() - Date.parse(value.at) < 3 * 60_000;
        if (r.key === "backup.last") lastBackupAt = value.at ?? null;
      }
    } catch {
      // Schema not migrated yet: the database is reachable, operational state is unknown.
    }
  }
  return Response.json(
    { ok: db, db, worker, contractVersion: CONTRACT_VERSION, lastBackupAt },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
