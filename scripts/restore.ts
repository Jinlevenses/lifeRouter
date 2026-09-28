import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@liferoute/server/db";
import { parseBackupKey, readBackup, restoreBackup } from "@liferoute/server";
import { loadEnv, requireEnv } from "./lib/env";

/**
 * Verified restore into a NEW database (docs/11_operations: 새 위치/DB에 검증 후 교체).
 *   pnpm restore --archive <file.lrbk> --verify
 *       decrypts and checks every file hash against the manifest; changes nothing.
 *   pnpm restore --archive <file.lrbk> --target-db <postgres url of an EMPTY database> --attachments-dir <new dir>
 *       migrates the empty target, restores rows and attachments. Any hash mismatch aborts before writing.
 * Switch over only after checking the restored app, by pointing DATABASE_URL / LIFEROUTE_DATA_DIR at it.
 */
loadEnv();
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const archive = arg("archive");
if (!archive) {
  console.error(
    "Usage: pnpm restore --archive <file.lrbk> [--verify | --target-db <url> --attachments-dir <dir>]",
  );
  process.exit(1);
}
const key = parseBackupKey(requireEnv("LIFEROUTE_BACKUP_KEY"));

if (process.argv.includes("--verify") || !arg("target-db")) {
  const { manifest } = await readBackup(resolve(archive), key);
  console.log(
    `OK: ${manifest.files.length} files verified (created ${manifest.createdAt}, contract ${manifest.contractVersion}).`,
  );
  console.log(
    Object.entries(manifest.counts)
      .map(([t, n]) => `${t}=${n}`)
      .join(" "),
  );
  process.exit(0);
}

const targetDb = arg("target-db")!;
const attachmentsDir = arg("attachments-dir");
if (!attachmentsDir) {
  console.error("--attachments-dir is required (a new, empty directory).");
  process.exit(1);
}
if (targetDb === process.env.DATABASE_URL) {
  console.error("Refusing to restore into the live DATABASE_URL. Create a new empty database first.");
  process.exit(1);
}
const { db, pool } = createDb(targetDb, 2);
try {
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../packages/server/drizzle") });
  const result = await restoreBackup(resolve(archive), key, { db, attachmentsRoot: resolve(attachmentsDir) });
  console.log(
    `Restored ${Object.values(result.counts).reduce((a, b) => a + b, 0)} rows and ${result.attachments} attachments.`,
  );
  console.log("Next: start the app against the restored database, check it, then switch DATABASE_URL.");
} finally {
  await pool.end();
}
