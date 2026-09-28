import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandHome, loadEnv } from "./lib/env";

/**
 * Runs a real PostgreSQL cluster for local development without Docker (IMPLEMENTATION ruling):
 * the optional `embedded-postgres` package ships official PostgreSQL binaries.
 * Data lives outside the repository under $LIFEROUTE_DATA_DIR/postgres (NFR-001).
 * Keep this process running; stop with Ctrl+C.
 */
loadEnv();
const dataDir = expandHome(process.env.LIFEROUTE_DATA_DIR ?? "~/LifeRouteData");
const clusterDir = join(dataDir, "postgres");
const secretFile = join(dataDir, "postgres.password");
const port = Number(process.env.LIFEROUTE_LOCAL_PG_PORT ?? 54329);

let EmbeddedPostgres: typeof import("embedded-postgres").default;
try {
  EmbeddedPostgres = (await import("embedded-postgres")).default;
} catch {
  console.error(
    "embedded-postgres is not installed (optional dependency). Use Docker Compose or an existing PostgreSQL and set DATABASE_URL.",
  );
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true, mode: 0o700 });
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(18).toString("base64url"), { mode: 0o600 });
const password = readFileSync(secretFile, "utf8").trim();

const pg = new EmbeddedPostgres({
  databaseDir: clusterDir,
  port,
  user: "liferoute",
  password,
  authMethod: "scram-sha-256",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const fresh = !existsSync(join(clusterDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("liferoute");

console.log(`PostgreSQL is running on 127.0.0.1:${port} (data: ${clusterDir})`);
console.log(`DATABASE_URL=postgres://liferoute:${password}@127.0.0.1:${port}/liferoute`);
console.log("Put that line in .env.local, then run `pnpm db:migrate`. Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
