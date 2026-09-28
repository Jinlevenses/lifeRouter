import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Loads KEY=VALUE pairs from .env.local / .env at the repository root without overriding
 * variables already present in the process environment. Secrets never live in git (NFR-001).
 */
export function loadEnv(root = resolve(import.meta.dirname, "..", "..")): void {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      let value = match[2] ?? "";
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function expandHome(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`${key} is not set. Copy .env.example to .env.local and fill it in (docs/11_operations).`);
    process.exit(1);
  }
  return value;
}
