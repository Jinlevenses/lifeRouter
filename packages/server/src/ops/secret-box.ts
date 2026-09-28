import { createHash } from "node:crypto";
import { decrypt, encrypt } from "./crypto";

/** OAuth refresh tokens at rest: AES-256-GCM keyed from BETTER_AUTH_SECRET (never stored in plain text). */
function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHash("sha256").update(`liferoute.oauth:${secret}`).digest();
}

export function sealJson(value: unknown): string {
  return encrypt(Buffer.from(JSON.stringify(value), "utf8"), key()).toString("base64");
}

export function openJson<T>(sealed: string): T {
  return JSON.parse(decrypt(Buffer.from(sealed, "base64"), key()).toString("utf8")) as T;
}
