import { startOfIsoWeek, startOfMonth } from "./date";

/**
 * Backup retention (docs/11_operations): keep the newest backup of each of the last
 * 7 days, 4 ISO weeks and 12 months. Input: backup dates (YYYY-MM-DD, one or more per day
 * identified by `id`). Returns the ids to keep; everything else may be pruned.
 */
export interface BackupRef {
  id: string;
  date: string;
  /** Instant used to order backups made on the same day. */
  createdAt: string;
}

export function selectRetained(
  backups: readonly BackupRef[],
  policy = { daily: 7, weekly: 4, monthly: 12 },
): Set<string> {
  const newestFirst = [...backups].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  const keep = new Set<string>();
  const pick = (bucketOf: (date: string) => string, limit: number) => {
    const seen = new Set<string>();
    for (const b of newestFirst) {
      const bucket = bucketOf(b.date);
      if (seen.has(bucket)) continue;
      if (seen.size >= limit) break;
      seen.add(bucket);
      keep.add(b.id);
    }
  };
  pick((d) => d, policy.daily);
  pick(startOfIsoWeek, policy.weekly);
  pick(startOfMonth, policy.monthly);
  return keep;
}
