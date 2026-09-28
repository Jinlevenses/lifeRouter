import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from "fflate";
import { CONTRACT_VERSION, TIMEZONE } from "@liferoute/contracts";
import { dateInZone, selectRetained, toMarkdown } from "@liferoute/core";
import type { Db } from "../db/client";
import { attachments, backupRuns, notes, opsState } from "../db/schema";
import { attachmentPath, attachmentsDir as defaultAttachmentsDir, backupsDir } from "../storage";
import { decrypt, encrypt, sha256 } from "./crypto";
import { dumpTables, restoreTables, type TableDump } from "./dump";

export interface ArchiveManifest {
  format: "liferoute-backup" | "liferoute-export";
  contractVersion: string;
  createdAt: string;
  files: { path: string; sha256: string; size: number }[];
  counts: Record<string, number>;
}

async function buildZip(
  db: Db,
  format: ArchiveManifest["format"],
  now: Date,
  attachmentsRoot: string,
): Promise<{ zip: Uint8Array; manifest: ArchiveManifest }> {
  const dump = await dumpTables(db, { portable: format === "liferoute-export" });
  const files: Record<string, Uint8Array> = {};
  for (const [table, rows] of Object.entries(dump)) files[`data/${table}.json`] = strToU8(JSON.stringify(rows));

  const attachmentRows = await db.select().from(attachments);
  for (const a of attachmentRows) {
    const bytes = await readFile(attachmentPath(a.sha256, attachmentsRoot)).catch(() => null);
    if (bytes) files[`attachments/${a.sha256}`] = new Uint8Array(bytes);
  }

  if (format === "liferoute-export") {
    // Portable Markdown copies of every live note, alongside the JSON data.
    const noteRows = await db.select().from(notes);
    for (const n of noteRows) {
      if (n.deletedAt) continue;
      const md = toMarkdown(n.title, n.document, { attachmentUrl: (id) => `../attachments/by-id/${id}` });
      const safe = (n.title || "note").replace(/[\\/:*?"<>|\n\r]+/g, " ").trim().slice(0, 60) || "note";
      files[`notes/${safe}-${n.id.slice(0, 8)}.md`] = strToU8(md);
    }
  }

  const manifest: ArchiveManifest = {
    format,
    contractVersion: CONTRACT_VERSION,
    createdAt: now.toISOString(),
    files: Object.entries(files)
      .map(([path, bytes]) => ({ path, sha256: sha256(Buffer.from(bytes)), size: bytes.length }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
  };
  const zippable: Zippable = { "manifest.json": strToU8(JSON.stringify(manifest, null, 2)) };
  for (const [path, bytes] of Object.entries(files)) zippable[path] = [bytes, { level: path.startsWith("attachments/") ? 0 : 6 }];
  return { zip: zipSync(zippable), manifest };
}

/** GET /api/v1/export: owner-requested portable copy (JSON + Markdown + attachments), no secrets. */
export async function createExport(db: Db, now = new Date(), attachmentsRoot = defaultAttachmentsDir()) {
  const { zip, manifest } = await buildZip(db, "liferoute-export", now, attachmentsRoot);
  return { zip, manifest, fileName: `liferoute-export-${dateInZone(now, TIMEZONE)}.zip` };
}

/** Opens an archive and verifies every file against the manifest; any mismatch aborts (docs/11_operations). */
export function openArchive(zip: Uint8Array): { manifest: ArchiveManifest; files: Record<string, Uint8Array> } {
  const entries = unzipSync(zip);
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("manifest.json is missing");
  const manifest = JSON.parse(strFromU8(manifestBytes)) as ArchiveManifest;
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const f of manifest.files) {
    const bytes = entries[f.path];
    if (!bytes) throw new Error(`Missing file in archive: ${f.path}`);
    if (bytes.length !== f.size || sha256(Buffer.from(bytes)) !== f.sha256) throw new Error(`Hash mismatch: ${f.path}`);
  }
  for (const path of Object.keys(entries)) {
    if (path !== "manifest.json" && !listed.has(path) && !path.endsWith("/")) throw new Error(`Unlisted file in archive: ${path}`);
  }
  delete entries["manifest.json"];
  return { manifest, files: entries };
}

function backupFileName(now: Date): string {
  return `liferoute-backup-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.lrbk`;
}

/** Encrypted daily backup (FR-010): archive + manifest + per-file hashes, AES-256-GCM with a separate key. */
export async function createBackup(
  db: Db,
  options: { key: Buffer; dir?: string; attachmentsRoot?: string; now?: Date },
): Promise<{ id: string; fileName: string; path: string; size: number; sha256: string; manifest: ArchiveManifest }> {
  const now = options.now ?? new Date();
  const dir = options.dir ?? backupsDir();
  const id = randomUUID();
  await db.insert(backupRuns).values({ id, startedAt: now });
  try {
    const { zip, manifest } = await buildZip(db, "liferoute-backup", now, options.attachmentsRoot ?? defaultAttachmentsDir());
    const sealed = encrypt(Buffer.from(zip), options.key);
    const fileName = backupFileName(now);
    const path = join(dir, fileName);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(`${path}.tmp`, sealed, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    const digest = sha256(sealed);
    const finishedAt = new Date();
    await db
      .update(backupRuns)
      .set({ finishedAt, ok: true, fileName, size: sealed.length, sha256: digest })
      .where(eq(backupRuns.id, id));
    await db
      .insert(opsState)
      .values({ key: "backup.last", value: { at: finishedAt.toISOString(), ok: true, fileName }, updatedAt: finishedAt })
      .onConflictDoUpdate({ target: opsState.key, set: { value: { at: finishedAt.toISOString(), ok: true, fileName }, updatedAt: finishedAt } });
    return { id, fileName, path, size: sealed.length, sha256: digest, manifest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(backupRuns).set({ finishedAt: new Date(), ok: false, error: message.slice(0, 500) }).where(eq(backupRuns.id, id));
    const last = await db.select().from(opsState).where(eq(opsState.key, "backup.last"));
    const previous = (last[0]?.value as { at?: string } | undefined)?.at ?? null;
    // Keep the last *successful* time visible; record the failure alongside it.
    await db
      .insert(opsState)
      .values({ key: "backup.last", value: { at: previous, ok: false, error: message.slice(0, 200) }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: opsState.key, set: { value: { at: previous, ok: false, error: message.slice(0, 200) }, updatedAt: new Date() } });
    throw error;
  }
}

export async function readBackup(path: string, key: Buffer) {
  return openArchive(new Uint8Array(decrypt(await readFile(path), key)));
}

/**
 * Restore into a NEW database and attachment directory; the caller switches over only after this
 * succeeds (docs/11_operations: "새 위치/DB에 검증 후 교체").
 */
export async function restoreBackup(
  path: string,
  key: Buffer,
  target: { db: Db; attachmentsRoot: string },
): Promise<{ manifest: ArchiveManifest; counts: Record<string, number>; attachments: number }> {
  const { manifest, files } = await readBackup(path, key);
  if (manifest.format !== "liferoute-backup") throw new Error("Not a backup archive");
  const dump: TableDump = {};
  for (const [p, bytes] of Object.entries(files)) {
    const m = /^data\/(.+)\.json$/.exec(p);
    if (m) dump[m[1]!] = JSON.parse(strFromU8(bytes)) as Record<string, unknown>[];
  }
  const counts = await restoreTables(target.db, dump);
  let restored = 0;
  for (const [p, bytes] of Object.entries(files)) {
    const m = /^attachments\/([0-9a-f]{64})$/.exec(p);
    if (!m) continue;
    const dest = attachmentPath(m[1]!, target.attachmentsRoot);
    await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
    await writeFile(dest, bytes, { mode: 0o600 });
    restored += 1;
  }
  return { manifest, counts, attachments: restored };
}

/** Deletes backups outside the 7 daily / 4 weekly / 12 monthly policy. Returns removed file names. */
export async function pruneBackups(
  dir: string,
  policy: { daily: number; weekly: number; monthly: number },
): Promise<string[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => /^liferoute-backup-\d{8}T\d{6}Z\.lrbk$/.test(n));
  const refs = names.map((name) => {
    const m = /^liferoute-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name)!;
    const instant = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
    return { id: name, date: dateInZone(instant, TIMEZONE), createdAt: instant };
  });
  const keep = selectRetained(refs, policy);
  const removed: string[] = [];
  for (const ref of refs) {
    if (keep.has(ref.id)) continue;
    await unlink(join(dir, ref.id));
    removed.push(ref.id);
  }
  return removed;
}

export async function backupFileInfo(path: string) {
  const info = await stat(path);
  return { size: info.size, mtime: info.mtime };
}
