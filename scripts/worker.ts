import { eq } from "drizzle-orm";
import { JOB_NAMES, type JobName } from "@liferoute/contracts";
import { createDb } from "@liferoute/server/db";
import { settings } from "@liferoute/server/schema";
import { googleJobs, integrationsFromEnv, log, workerJobs, type JobQueue } from "@liferoute/server";
import { loadEnv, requireEnv } from "./lib/env";

/**
 * Background worker (docs/02_architecture, docs/11_operations): a separate Node process from the web
 * app. Runs Google sync/apply, consented AI analysis, daily encrypted backups with catch-up,
 * idempotency pruning, a heartbeat, and a sweep that re-enqueues work lost between commit and send.
 * Usage: pnpm worker
 */
loadEnv();
const url = requireEnv("DATABASE_URL");
const { db, pool } = createDb(url, 5);
const { PgBoss } = await import("pg-boss");
const boss = new PgBoss({ connectionString: url });
boss.on("error", (error: Error) => log.error("worker.boss_error", error));
await boss.start();
for (const name of Object.values(JOB_NAMES)) await boss.createQueue(name);

const integrations = await integrationsFromEnv();
const queue: JobQueue = {
  async send(name, data, options) {
    return (
      (await boss.send(name, data, {
        singletonKey: options?.singletonKey,
        retryLimit: 3,
        retryBackoff: true,
      })) !== null
    );
  },
};

type Data = Record<string, unknown>;
async function work(name: JobName, fn: (data: Data) => Promise<unknown>) {
  await boss.work<Data>(name, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    try {
      await fn(job.data ?? {});
    } catch (error) {
      log.error("worker.job_failed", error, { job: name });
      throw error; // pg-boss retries with backoff
    }
  });
}

await work(JOB_NAMES.googleSync, () => googleJobs.googleSync(db, integrations.calendar));
await work(JOB_NAMES.googleApplyProposal, (d) =>
  googleJobs.applyProposal(db, integrations.calendar, String(d.proposalId)),
);
await work(JOB_NAMES.aiAnalysis, (d) => workerJobs.runAnalysis(db, integrations, String(d.analysisId)));
await work(JOB_NAMES.receiptOcr, (d) => workerJobs.runOcr(db, integrations, String(d.receiptId)));
await work(JOB_NAMES.tossSync, async () => {
  if (!integrations.balance.available) log.info("toss.skipped", { reason: "disconnected" });
});
await work(JOB_NAMES.idempotencyPrune, () => workerJobs.pruneIdempotency(db));
await work(JOB_NAMES.backupDaily, async () => {
  if (!process.env.LIFEROUTE_BACKUP_KEY) {
    log.warn("backup.skipped", { reason: "LIFEROUTE_BACKUP_KEY is not set" });
    return;
  }
  await workerJobs.runBackup(db);
});

// Schedules (Asia/Seoul). The backup time follows Settings and is re-applied when it changes.
let scheduledBackupAt = "";
async function syncSchedules() {
  const [row] = await db.select().from(settings).where(eq(settings.id, "settings"));
  const dailyAt = row?.backup.dailyAt ?? "03:30";
  if (dailyAt !== scheduledBackupAt) {
    const [h, m] = dailyAt.split(":").map(Number);
    await boss.schedule(
      JOB_NAMES.backupDaily,
      `${m} ${h} * * *`,
      { reason: "schedule" },
      { tz: "Asia/Seoul" },
    );
    scheduledBackupAt = dailyAt;
    log.info("worker.backup_scheduled", { dailyAt });
  }
}
await boss.schedule(JOB_NAMES.googleSync, "*/15 * * * *", { reason: "schedule" }, { tz: "Asia/Seoul" });
await boss.schedule(JOB_NAMES.idempotencyPrune, "17 * * * *", {}, { tz: "Asia/Seoul" });
await syncSchedules();

// Catch-up: if the last successful backup is older than 24h (e.g. the Mac was asleep), back up now.
if (process.env.LIFEROUTE_BACKUP_KEY && (await workerJobs.backupIsDue(db))) {
  await queue.send(JOB_NAMES.backupDaily, { reason: "catch-up" }, { singletonKey: "backup" });
}

async function tick() {
  try {
    await workerJobs.heartbeat(db);
    await workerJobs.sweep(db, queue);
    await syncSchedules();
  } catch (error) {
    log.error("worker.tick_failed", error);
  }
}
await tick();
const timer = setInterval(tick, 60_000);
log.info("worker.started", {
  google: integrations.calendar.available,
  ai: integrations.ai.available,
  backup: !!process.env.LIFEROUTE_BACKUP_KEY,
});

async function shutdown() {
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 20_000 }).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
