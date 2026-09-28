import { describe, expect, it } from "vitest";
import { addDays } from "../src/date";
import { selectRetained, type BackupRef } from "../src/retention";

function daily(from: string, days: number): BackupRef[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { id: date, date, createdAt: `${date}T18:00:00.000Z` };
  });
}

describe("backup retention 7 daily / 4 weekly / 12 monthly (OPS-BACKUP-001)", () => {
  it("keeps everything when there are only a few backups", () => {
    const backups = daily("2026-09-20", 3);
    expect(selectRetained(backups).size).toBe(3);
  });

  it("bounds the retained set for a year of daily backups", () => {
    const backups = daily("2025-09-01", 400);
    const kept = selectRetained(backups);
    // 7 daily + up to 4 weekly + up to 12 monthly, with overlaps collapsing.
    expect(kept.size).toBeLessThanOrEqual(23);
    expect(kept.size).toBeGreaterThanOrEqual(12);
    const newest = backups.at(-1)!;
    expect(kept.has(newest.id)).toBe(true);
    // The newest backup of each of the last 12 months is kept.
    expect(kept.has("2026-08-31")).toBe(true);
    expect(kept.has("2025-11-30")).toBe(true);
  });

  it("keeps the newest of several backups on the same day", () => {
    const backups: BackupRef[] = [
      { id: "a", date: "2026-09-28", createdAt: "2026-09-28T01:00:00.000Z" },
      { id: "b", date: "2026-09-28", createdAt: "2026-09-28T09:00:00.000Z" },
    ];
    expect([...selectRetained(backups)]).toEqual(["b"]);
  });
});
