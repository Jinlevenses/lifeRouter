import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { request } from "@playwright/test";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../packages/server/src/db/client";
import { createAuth, createOwner } from "../packages/server/src/auth";
import { BASE_URL, E2E_DATABASE_URL } from "../playwright.config";

export const OWNER = { email: "owner@e2e.test", password: "e2e-password-123456", name: "테스트" };
export const STORAGE_STATE = resolve(import.meta.dirname, ".auth/owner.json");

/**
 * Fresh schema + migrations + the single owner, then one sign-in whose session every test reuses
 * (signing in per test would trip the 5-per-minute sign-in rate limit, as intended).
 */
export default async function globalSetup() {
  process.env.BETTER_AUTH_SECRET = "e2e-only-secret-not-for-production-use-000000";
  const { db, pool } = createDb(E2E_DATABASE_URL, 2);
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists pgboss cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../packages/server/drizzle") });
    await createOwner(createAuth(db), db, OWNER);
  } finally {
    await pool.end();
  }
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const res = await api.post("/api/auth/sign-in/email", {
    data: { email: OWNER.email, password: OWNER.password },
  });
  if (!res.ok()) throw new Error(`E2E sign-in failed: ${res.status()} ${await res.text()}`);
  await mkdir(resolve(import.meta.dirname, ".auth"), { recursive: true });
  await api.storageState({ path: STORAGE_STATE });
  await api.dispose();
}
