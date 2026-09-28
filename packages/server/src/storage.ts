import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Personal data lives outside the repository (NFR-001). */
export function dataDir(): string {
  const raw = process.env.LIFEROUTE_DATA_DIR || "~/LifeRouteData";
  return raw.startsWith("~/") ? resolve(homedir(), raw.slice(2)) : resolve(raw);
}

export function attachmentsDir(): string {
  return process.env.LIFEROUTE_ATTACHMENTS_DIR
    ? resolve(process.env.LIFEROUTE_ATTACHMENTS_DIR)
    : join(dataDir(), "attachments");
}

export function backupsDir(): string {
  return process.env.LIFEROUTE_BACKUP_DIR
    ? resolve(process.env.LIFEROUTE_BACKUP_DIR)
    : join(dataDir(), "backups");
}

export function attachmentPath(sha256: string, dir = attachmentsDir()): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("invalid sha256");
  return join(dir, sha256.slice(0, 2), sha256);
}
