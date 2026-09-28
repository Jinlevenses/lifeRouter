import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

// Money columns are NUMERIC and must stay strings end-to-end (ADR-002); pg already
// returns NUMERIC (oid 1700) as text, and DATE (oid 1082) is kept as "YYYY-MM-DD" text.
pg.types.setTypeParser(1082, (value) => value);

interface Handle {
  pool: pg.Pool;
  db: Db;
}

const globalKey = Symbol.for("liferoute.db");
type GlobalWithDb = typeof globalThis & { [globalKey]?: Handle };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example and docs/11_operations.");
  return url;
}

export function createDb(url: string = databaseUrl(), max = 10): Handle {
  const pool = new pg.Pool({ connectionString: url, max });
  return { pool, db: drizzle(pool, { schema }) };
}

/** Process-wide handle; survives Next dev hot reloads. */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey]) g[globalKey] = createDb();
  return g[globalKey].db;
}

export function getPool(): pg.Pool {
  getDb();
  return (globalThis as GlobalWithDb)[globalKey]!.pool;
}
