/**
 * Minimal structured logger with redaction (docs/13_security, review D-56): balances, note bodies,
 * tokens and OAuth payloads never reach logs.
 */
const REDACT_KEYS = /amount|balance|krw|text|document|body|title|token|secret|password|authorization|cookie|code|refresh|access|key|merchant|memo|url/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (value instanceof Error) return { name: value.name, message: maskSecrets(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return typeof value === "string" ? maskSecrets(value) : value;
}

/** Removes query strings and bearer/API-key looking substrings from external error messages. */
export function maskSecrets(message: string): string {
  return message
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, "$1?…")
    .replace(/\b(Bearer|token|key)[=:\s]+[A-Za-z0-9._~+/-]{8,}/gi, "$1 [redacted]")
    .replace(/\b(sk-ant-|lrc_|ya29\.)[A-Za-z0-9._-]+/g, "$1[redacted]")
    .slice(0, 500);
}

export const log = {
  info(event: string, meta?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", event, ...(meta ? { meta: redact(meta) } : {}), at: new Date().toISOString() }));
  },
  warn(event: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", event, ...(meta ? { meta: redact(meta) } : {}), at: new Date().toISOString() }));
  },
  error(event: string, error: unknown, meta?: Record<string, unknown>) {
    console.error(
      JSON.stringify({ level: "error", event, error: redact(error), ...(meta ? { meta: redact(meta) } : {}), at: new Date().toISOString() }),
    );
  },
};
