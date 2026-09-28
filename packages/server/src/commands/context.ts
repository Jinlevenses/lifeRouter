import type { Settings, VersionedResourceType } from "@liferoute/contracts";
import type { Tx } from "../db/client";
import { notFound, versionConflict } from "../errors";
import type { JobQueue } from "../jobs";
import type { Integrations } from "../integrations";

export type Actor = "owner" | "ai";

export interface CommandContext {
  tx: Tx;
  now: Date;
  /** Owner's calendar date (Asia/Seoul), decided by the server (review D-06). */
  today: string;
  settings: Settings;
  actor: Actor;
  jobs: JobQueue;
  integrations: Integrations;
  /** Runs after the transaction commits (job enqueueing, file cleanup). */
  afterCommit(fn: () => Promise<void>): void;
}

/** Checks existence, soft deletion and the expected version of a row locked FOR UPDATE. */
export function assertVersion<R extends { version: number; deletedAt?: Date | null }>(
  row: R | undefined,
  expectedVersion: number,
  resourceType: VersionedResourceType,
  id: string,
  toEntity: (r: R) => unknown,
  label: string,
): R {
  if (!row || row.deletedAt) throw notFound(label);
  if (row.version !== expectedVersion) {
    throw versionConflict(resourceType, id, expectedVersion, row.version, toEntity(row));
  }
  return row;
}
