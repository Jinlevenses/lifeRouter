import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db, DbOrTx } from "../db/client";
import * as s from "../db/schema";

/**
 * Logical dump/restore of the domain tables (docs/11_operations, OPS-BACKUP-001/OPS-RESTORE-001).
 * Portable JSON instead of pg_dump so backups do not depend on matching PostgreSQL client binaries.
 * Order respects foreign keys. Ephemeral tables (sessions, idempotency log, rate limits) are skipped.
 */
export const DUMP_TABLES: readonly PgTable[] = [
  s.user,
  s.account,
  s.settings,
  s.goals,
  s.projects,
  s.tasks,
  s.routines,
  s.checkIns,
  s.accounts,
  s.balanceSnapshots,
  s.notes,
  s.noteRevisions,
  s.noteLinks,
  s.collections,
  s.collectionRecords,
  s.connections,
  s.calendarEvents,
  s.proposals,
  s.attachments,
  s.inboxItems,
  s.receipts,
  s.reviews,
  s.analyses,
  s.aiUsage,
  s.guidanceSources,
  s.apiTokens,
  s.backupRuns,
];

export type TableDump = Record<string, Record<string, unknown>[]>;

/** Rows are keyed by column (JS) name; Date values become ISO strings. */
export async function dumpTables(db: DbOrTx, options: { portable?: boolean } = {}): Promise<TableDump> {
  const out: TableDump = {};
  for (const table of DUMP_TABLES) {
    const name = getTableName(table);
    const rows = (await db.select().from(table)) as Record<string, unknown>[];
    out[name] = rows.map((row) => {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) copy[k] = v instanceof Date ? v.toISOString() : v;
      if (options.portable) {
        // Portable exports are unencrypted: never include credentials or password hashes.
        if (name === "connections") {
          copy.secret = null;
          copy.syncState = {};
        }
        if (name === "account") copy.password = null;
        if (name === "api_tokens") copy.tokenHash = "";
      }
      return copy;
    });
  }
  return out;
}

function reviveRow(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const revived: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in row)) continue;
    const value = row[key];
    revived[key] = column.columnType === "PgTimestamp" && typeof value === "string" ? new Date(value) : value;
  }
  return revived;
}

/** Restores a dump into an empty, migrated database. Refuses to write into a database that has data. */
export async function restoreTables(db: Db, dump: TableDump): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const table of DUMP_TABLES) {
      const name = getTableName(table);
      const [row] = await tx
        .execute<{ n: number }>(sql`select count(*)::int as n from ${table}`)
        .then((r) => r.rows);
      if (row && Number(row.n) > 0)
        throw new Error(`Target database is not empty (${name}). Restore only into a fresh database.`);
    }
    for (const table of DUMP_TABLES) {
      const name = getTableName(table);
      const rows = dump[name] ?? [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => reviveRow(table, r));
        if (chunk.length > 0) await tx.insert(table).values(chunk as never);
      }
      counts[name] = rows.length;
    }
  });
  return counts;
}
