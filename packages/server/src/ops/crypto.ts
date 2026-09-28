import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Backup encryption (docs/11_operations, docs/13_security): AES-256-GCM with a key that is
 * separate from the auth secret. File layout: MAGIC(8) | IV(12) | TAG(16) | ciphertext.
 */
const MAGIC = Buffer.from("LRBK0001", "ascii");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function parseBackupKey(base64: string | undefined): Buffer {
  if (!base64) throw new Error("LIFEROUTE_BACKUP_KEY is not set (32 random bytes, base64).");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("LIFEROUTE_BACKUP_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(sealed: Buffer, key: Buffer): Buffer {
  if (sealed.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a LifeRoute backup file (bad header).");
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = sealed.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const body = sealed.subarray(MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
