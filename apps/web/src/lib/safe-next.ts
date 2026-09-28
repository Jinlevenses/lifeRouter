const BASE = "http://liferoute.invalid";

/**
 * Post-login destination: only a path on this origin. Parsing with the same WHATWG rules the
 * browser uses catches `/\evil.example`, `/\t/evil.example` and similar that a prefix check misses.
 * Anything else (absolute URL, repeated `?next=`, control characters) falls back to "/".
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  // Backslashes and control characters never appear in paths this app generates.
  for (const ch of next) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return "/";
  }
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
