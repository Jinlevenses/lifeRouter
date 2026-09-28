import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { createDb } from "@liferoute/server/db";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();
const url = requireEnv("DATABASE_URL");
const { db, pool } = createDb(url, 1);
try {
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../packages/server/drizzle") });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
