import { JOB_NAMES, type JobName } from "@liferoute/contracts";

/**
 * Background jobs (pg-boss). Commands enqueue after their transaction commits; the separate
 * worker process (scripts/worker.ts) consumes them. Tests use an in-memory queue.
 */
export interface JobQueue {
  send(name: JobName, data: object, options?: { singletonKey?: string }): Promise<boolean>;
}

export class MemoryJobQueue implements JobQueue {
  readonly sent: { name: JobName; data: object; singletonKey?: string }[] = [];
  async send(name: JobName, data: object, options?: { singletonKey?: string }) {
    this.sent.push({ name, data, singletonKey: options?.singletonKey });
    return true;
  }
}

type PgBossInstance = InstanceType<typeof import("pg-boss").PgBoss>;
const bossKey = Symbol.for("liferoute.boss");
type GlobalWithBoss = typeof globalThis & { [bossKey]?: Promise<PgBossInstance> };

/** Shared pg-boss instance for enqueueing from the web process (no workers, no scheduling here). */
export async function getBoss(connectionString = process.env.DATABASE_URL!): Promise<PgBossInstance> {
  const g = globalThis as GlobalWithBoss;
  if (!g[bossKey]) {
    g[bossKey] = (async () => {
      const { PgBoss } = await import("pg-boss");
      const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
      boss.on("error", (error: Error) => console.error("[pg-boss]", error.message));
      await boss.start();
      for (const name of Object.values(JOB_NAMES)) await boss.createQueue(name);
      return boss;
    })().catch((error) => {
      delete g[bossKey];
      throw error;
    });
  }
  return g[bossKey];
}

export class PgBossJobQueue implements JobQueue {
  async send(name: JobName, data: object, options?: { singletonKey?: string }) {
    const boss = await getBoss();
    const id = await boss.send(name, data, {
      singletonKey: options?.singletonKey,
      retryLimit: 3,
      retryBackoff: true,
    });
    return id !== null;
  }
}
