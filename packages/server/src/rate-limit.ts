/**
 * Fixed-window in-memory rate limiter for the single app process (review D-34):
 * commands 600/min, capture 60/min. Sign-in limits are enforced by Better Auth in the database.
 */
const buckets = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): { ok: boolean; retryAfterSec: number } {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (now - b.windowStart >= windowMs) buckets.delete(k);
    }
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit)
    return { ok: false, retryAfterSec: Math.ceil((bucket.windowStart + windowMs - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

export const LIMITS = { commands: 600, capture: 60, reads: 1200 } as const;
