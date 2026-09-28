import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuth, createOwner, OwnerExistsError } from "../src/auth";
import { capture, verifyCaptureToken } from "../src/capture";
import { sniffMime } from "../src/attachments";
import { createBackup, createExport, readBackup, restoreBackup } from "../src/ops/archive";
import { loadWorkspace } from "../src/workspace";
import { pruneIdempotency } from "../src/worker/jobs";
import { freshDb, harness, recreateDatabase, type Harness } from "./helpers";

let h: Harness;
let close: () => Promise<void>;
let dir: string;
const key = randomBytes(32);

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
  dir = await mkdtemp(join(tmpdir(), "liferoute-ops-"));
  process.env.LIFEROUTE_DATA_DIR = dir;
  const t = await freshDb();
  close = t.close;
  h = harness(t.db);
});
afterAll(async () => {
  await close();
  await rm(dir, { recursive: true, force: true });
});

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f00000000049454e44ae426082",
  "hex",
);

describe("INT-AUTH-001 single owner (NFR-001)", () => {
  it("creates exactly one owner and refuses a second", async () => {
    const auth = createAuth(h.db);
    const owner = await createOwner(auth, h.db, {
      email: "Me@Example.com",
      name: "나",
      password: "correct horse battery",
    });
    expect(owner.email).toBe("me@example.com");
    await expect(
      createOwner(auth, h.db, { email: "other@example.com", name: "x", password: "another long password" }),
    ).rejects.toBeInstanceOf(OwnerExistsError);
    const signIn = await auth.api.signInEmail({
      body: { email: "me@example.com", password: "correct horse battery" },
    });
    expect(signIn.user.email).toBe("me@example.com");
    await expect(
      auth.api.signUpEmail({
        body: { email: "intruder@example.com", password: "long enough password", name: "x" },
      }),
    ).rejects.toThrow();
  });
});

describe("INT-CAPTURE-001 / SEC-ATTACH-001 iPhone capture (FR-007)", () => {
  it("accepts a capture-scoped bearer token and stores images outside the repo", async () => {
    const { secret, token } = await h.ok({
      type: "token.create",
      payload: { label: "iPhone", scope: "capture" },
    });
    await expect(verifyCaptureToken(h.db, "Bearer lrc_wrongwrongwrongwrongwrong")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await verifyCaptureToken(h.db, `Bearer ${secret}`);

    const text = await capture(h.db, h.integrations, {
      fields: { kind: "text", text: "우유 사기" },
      file: null,
    });
    expect(text.item).toMatchObject({ kind: "text", status: "new", source: "shortcut" });

    const receipt = await capture(h.db, h.integrations, {
      fields: { kind: "receipt", source: "share" },
      file: { bytes: PNG, name: "IMG_0001.png" },
    });
    expect(receipt.attachment?.mime).toBe("image/png");
    expect(receipt.receipt?.status).toBe("draft");
    expect(receipt.receipt?.ocr.status).toBe("unavailable");
    expect(receipt.item.convertedTo).toEqual({ type: "receipt", id: receipt.receipt!.id });
    const stored = await readFile(
      join(dir, "attachments", receipt.attachment!.sha256.slice(0, 2), receipt.attachment!.sha256),
    );
    expect(stored.equals(PNG)).toBe(true);

    // Owner confirmation is the only way to a spending record.
    const confirmed = await h.ok({
      type: "receipt.confirm",
      payload: {
        receiptId: receipt.receipt!.id,
        expectedVersion: 1,
        confirmed: {
          merchant: "동네마트",
          amountKrw: "12800",
          date: "2026-09-27",
          category: "식비",
          memo: null,
        },
      },
    });
    expect(confirmed.receipt.status).toBe("confirmed");

    await expect(
      capture(h.db, h.integrations, {
        fields: { kind: "image" },
        file: { bytes: Buffer.from("<svg onload=alert(1)>"), name: "x.png" },
      }),
    ).rejects.toMatchObject({ code: "ATTACHMENT_REJECTED" });

    await h.ok({ type: "token.revoke", payload: { tokenId: token.id } });
    await expect(verifyCaptureToken(h.db, `Bearer ${secret}`)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("decides MIME by magic bytes", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0, 1, 2, 3]))).toBeNull();
  });
});

describe("OPS-BACKUP-001 / OPS-RESTORE-001 encrypted backup and verified restore (FR-010)", () => {
  it("round-trips into a fresh database and refuses tampered archives", async () => {
    const { note } = await h.ok({ type: "note.create", payload: { title: "백업 확인용" } });
    const { account } = await h.ok({
      type: "account.create",
      payload: { name: "통장", kind: "asset", category: "deposit" },
    });
    await h.ok({
      type: "snapshot.add",
      payload: { accountId: account.id, asOf: "2026-09-27", amount: "1234567.5" },
    });

    const backup = await createBackup(h.db, {
      key,
      dir: join(dir, "backups"),
      attachmentsRoot: join(dir, "attachments"),
      now: h.now,
    });
    const sealed = await readFile(backup.path);
    expect(sealed.includes(Buffer.from("백업 확인용"))).toBe(false); // encrypted at rest
    const opened = await readBackup(backup.path, key);
    expect(opened.manifest.files.some((f) => f.path === "data/notes.json")).toBe(true);

    await expect(readBackup(backup.path, randomBytes(32))).rejects.toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 10]! ^= 0xff;
    const tamperedPath = join(dir, "tampered.lrbk");
    await writeFile(tamperedPath, tampered);
    await expect(readBackup(tamperedPath, key)).rejects.toThrow();

    const targetUrl = await recreateDatabase("liferoute_test_restore");
    const target = await freshDb(targetUrl);
    try {
      const restoredDir = join(dir, "restored-attachments");
      const result = await restoreBackup(backup.path, key, { db: target.db, attachmentsRoot: restoredDir });
      expect(result.counts.notes).toBeGreaterThan(0);
      expect(result.attachments).toBeGreaterThan(0);
      const ws = await loadWorkspace(target.db, h.now);
      expect(ws.notes.map((n) => n.title)).toContain("백업 확인용");
      expect(ws.snapshots.find((s) => s.accountId === account.id)?.amount).toBe("1234567.5");
      expect(ws.notes.find((n) => n.id === note.id)).toBeTruthy();
      // Restoring twice into the same (now non-empty) database is refused.
      await expect(
        restoreBackup(backup.path, key, { db: target.db, attachmentsRoot: restoredDir }),
      ).rejects.toThrow(/not empty/);
    } finally {
      await target.close();
    }
  });
});

describe("OPS-EXPORT-001 portable export", () => {
  it("contains data, Markdown notes and no credentials", async () => {
    const { zip, manifest } = await createExport(h.db, h.now, join(dir, "attachments"));
    const files = unzipSync(zip);
    expect(manifest.format).toBe("liferoute-export");
    expect(Object.keys(files).some((p) => p.startsWith("notes/") && p.endsWith(".md"))).toBe(true);
    const accountRows = JSON.parse(strFromU8(files["data/account.json"]!)) as { password: string | null }[];
    expect(accountRows.every((r) => r.password === null)).toBe(true);
    const tokens = JSON.parse(strFromU8(files["data/api_tokens.json"]!)) as { tokenHash: string }[];
    expect(tokens.every((t) => t.tokenHash === "")).toBe(true);
  });
});

describe("INT-API-002 idempotency retention", () => {
  it("prunes keys older than 24 hours", async () => {
    await h.ok({
      type: "inbox.create",
      payload: { kind: "text", text: "old" },
      idempotencyKey: "old-key-000001",
    });
    expect(await pruneIdempotency(h.db, new Date(h.now.getTime() + 25 * 3600_000))).toBeGreaterThan(0);
  });
});
