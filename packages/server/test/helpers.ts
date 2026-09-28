import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { CommandInput } from "@liferoute/contracts";
import { createDb, type Db } from "../src/db/client";
import { executeCommand } from "../src/commands/execute";
import { disconnectedIntegrations, type Integrations } from "../src/integrations";
import { MemoryJobQueue } from "../src/jobs";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://liferoute:liferoute@127.0.0.1:5432/liferoute_test";

const MIGRATIONS = resolve(import.meta.dirname, "../drizzle");

/** Fresh schema per test file: drop everything, then apply the real migrations. */
export async function freshDb(url = TEST_DATABASE_URL): Promise<{ db: Db; close: () => Promise<void> }> {
  const { db, pool } = createDb(url, 4);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => pool.end() };
}

/** Creates (or recreates) a sibling database, e.g. a restore target. */
export async function recreateDatabase(name: string, baseUrl = TEST_DATABASE_URL): Promise<string> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

export interface Harness {
  db: Db;
  jobs: MemoryJobQueue;
  integrations: Integrations;
  now: Date;
  run: (command: CommandInput, actor?: "owner" | "ai") => Promise<{ status: number; body: any }>;
  ok: (command: CommandInput) => Promise<any>;
}

export function harness(db: Db, now = new Date("2026-09-28T03:00:00.000Z"), integrations = disconnectedIntegrations()): Harness {
  const jobs = new MemoryJobQueue();
  const h: Harness = {
    db,
    jobs,
    integrations,
    now,
    run: (command, actor = "owner") => executeCommand({ db, jobs, integrations: h.integrations, now: () => h.now }, command, actor),
    ok: async (command) => {
      const res = await h.run(command);
      if (res.status !== 200) throw new Error(`${command.type} failed: ${JSON.stringify(res.body)}`);
      return res.body.result;
    },
  };
  return h;
}
