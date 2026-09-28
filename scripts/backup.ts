import { createDb } from "@liferoute/server/db";
import { createBackup, parseBackupKey, pruneBackups, backupsDir } from "@liferoute/server";
import { loadEnv, requireEnv } from "./lib/env";

/**
 * Manual encrypted backup (docs/11_operations). Usage: pnpm backup [--dir /Volumes/External/LifeRoute]
 * Writes liferoute-backup-<UTC>.lrbk (AES-256-GCM, manifest with per-file sha256) and prunes to 7/4/12.
 */
loadEnv();
const { db, pool } = createDb(requireEnv("DATABASE_URL"), 2);
const key = parseBackupKey(requireEnv("LIFEROUTE_BACKUP_KEY"));
const i = process.argv.indexOf("--dir");
const dir = i >= 0 ? process.argv[i + 1] : backupsDir();
try {
  const result = await createBackup(db, { key, dir });
  const pruned = await pruneBackups(dir!, { daily: 7, weekly: 4, monthly: 12 });
  console.log(`Backup written: ${result.path}`);
  console.log(`size=${result.size} sha256=${result.sha256} files=${result.manifest.files.length}`);
  if (pruned.length) console.log(`Pruned by retention: ${pruned.join(", ")}`);
} finally {
  await pool.end();
}
