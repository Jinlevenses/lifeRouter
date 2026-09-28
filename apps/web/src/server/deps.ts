import "server-only";
import { getDb } from "@liferoute/server/db";
import { PgBossJobQueue, getIntegrations, type ExecuteDeps } from "@liferoute/server";

const jobs = new PgBossJobQueue();

export async function commandDeps(): Promise<ExecuteDeps> {
  return { db: getDb(), jobs, integrations: await getIntegrations() };
}
