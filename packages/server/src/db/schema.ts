import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CalendarEventDraft,
  CollectionProperty,
  CollectionView,
  CostEstimate,
  DocumentNode,
  PropertyValue,
  Receipt,
  Recurrence,
  ReviewComputed,
  Settings,
} from "@liferoute/contracts";

export * from "./auth-schema";

/*
 * Domain tables (docs/03_data). Single owner: no owner_id columns (ADR-001).
 * Money is NUMERIC and read back as a string; business dates are DATE ("YYYY-MM-DD");
 * instants are timestamptz. Versioned resources carry `version` for optimistic concurrency.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });
const money = (name: string) => numeric(name);
const audit = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};
const versioned = { version: integer("version").notNull().default(1) };
const softDelete = { deletedAt: ts("deleted_at") };

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("settings"),
  finance: jsonb("finance").$type<Settings["finance"]>().notNull(),
  ai: jsonb("ai").$type<Settings["ai"]>().notNull(),
  backup: jsonb("backup").$type<Settings["backup"]>().notNull(),
  capture: jsonb("capture").$type<Settings["capture"]>().notNull(),
  updatedAt: audit.updatedAt,
  ...versioned,
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").$type<"active" | "achieved" | "dropped">().notNull().default("active"),
  targetDate: day("target_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...audit,
  ...softDelete,
  ...versioned,
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    goalId: uuid("goal_id").references(() => goals.id),
    title: text("title").notNull(),
    doneCriteria: text("done_criteria").notNull().default(""),
    status: text("status").$type<"active" | "done" | "dropped">().notNull().default("active"),
    dueDate: day("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...audit,
    ...softDelete,
    ...versioned,
  },
  (t) => [index("projects_goal_idx").on(t.goalId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<"open" | "done" | "cancelled">().notNull().default("open"),
    projectId: uuid("project_id").references(() => projects.id),
    goalId: uuid("goal_id").references(() => goals.id),
    dueDate: day("due_date"),
    plannedAt: ts("planned_at"),
    plannedDurationMin: integer("planned_duration_min"),
    topDate: day("top_date"),
    topRank: smallint("top_rank").$type<1 | 2 | 3>(),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    seriesId: uuid("series_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: ts("completed_at"),
    ...audit,
    ...softDelete,
    ...versioned,
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_planned_idx").on(t.plannedAt),
    // Database guard for the Top 3 invariant: one open task per (topDate, topRank).
    uniqueIndex("tasks_top_slot_uq")
      .on(t.topDate, t.topRank)
      .where(sql`${t.status} = 'open' and ${t.deletedAt} is null and ${t.topDate} is not null`),
  ],
);

export const routines = pgTable("routines", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  schedule: jsonb("schedule").$type<Recurrence>().notNull(),
  status: text("status").$type<"active" | "paused" | "archived">().notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...audit,
  ...softDelete,
  ...versioned,
});

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id),
    date: day("date").notNull(),
    status: text("status").$type<"done" | "skipped">().notNull(),
    note: text("note"),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("check_ins_routine_date_uq").on(t.routineId, t.date),
    index("check_ins_date_idx").on(t.date),
  ],
);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<"asset" | "liability">().notNull(),
  category: text("category").notNull(),
  institution: text("institution"),
  currency: text("currency").notNull().default("KRW"),
  included: boolean("included").notNull().default(true),
  liquid: boolean("liquid").notNull().default(false),
  memo: text("memo"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: ts("archived_at"),
  archiveReason: text("archive_reason"),
  ...audit,
  ...versioned,
});

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    asOf: day("as_of").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    fxRate: money("fx_rate"),
    amountKrw: money("amount_krw").notNull(),
    estimated: boolean("estimated").notNull().default(false),
    reason: text("reason"),
    source: text("source").$type<"manual" | "toss">().notNull().default("manual"),
    createdAt: audit.createdAt,
  },
  (t) => [uniqueIndex("snapshots_account_asof_uq").on(t.accountId, t.asOf)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull().default(""),
    document: jsonb("document").$type<DocumentNode>().notNull(),
    text: text("text").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    projectId: uuid("project_id").references(() => projects.id),
    goalId: uuid("goal_id").references(() => goals.id),
    ...audit,
    ...softDelete,
    ...versioned,
  },
  (t) => [index("notes_updated_idx").on(t.updatedAt)],
);

export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: uuid("id").primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    document: jsonb("document").$type<DocumentNode>().notNull(),
    text: text("text").notNull(),
    savedAt: ts("saved_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("note_revisions_note_version_uq").on(t.noteId, t.version)],
);

export const noteLinks = pgTable(
  "note_links",
  {
    sourceNoteId: uuid("source_note_id")
      .notNull()
      .references(() => notes.id),
    targetType: text("target_type").$type<"note" | "project" | "goal" | "task">().notNull(),
    targetId: uuid("target_id").notNull(),
    label: text("label").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceNoteId, t.targetType, t.targetId] }),
    index("note_links_target_idx").on(t.targetType, t.targetId),
  ],
);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  properties: jsonb("properties").$type<CollectionProperty[]>().notNull(),
  views: jsonb("views").$type<CollectionView[]>().notNull(),
  ...audit,
  ...softDelete,
  ...versioned,
});

export const collectionRecords = pgTable(
  "collection_records",
  {
    id: uuid("id").primaryKey(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id),
    values: jsonb("values").$type<Record<string, PropertyValue>>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...audit,
    ...softDelete,
    ...versioned,
  },
  (t) => [index("collection_records_collection_idx").on(t.collectionId)],
);

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey(),
  provider: text("provider").$type<"google" | "toss" | "ai">().notNull().unique(),
  status: text("status")
    .$type<"disconnected" | "connected" | "reauth_required" | "stale" | "failed">()
    .notNull()
    .default("disconnected"),
  label: text("label"),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  meta: jsonb("meta")
    .$type<{ calendarIds?: string[]; managedCalendarId?: string | null; tossAccountIds?: string[] }>()
    .notNull()
    .default({}),
  lastSyncAt: ts("last_sync_at"),
  lastSuccessAt: ts("last_success_at"),
  lastError: text("last_error"),
  /** Server-only: encrypted OAuth tokens. Never part of any read model. */
  secret: text("secret"),
  /** Server-only: sync cursors (e.g. Google syncToken per calendar). */
  syncState: jsonb("sync_state").$type<Record<string, unknown>>().notNull().default({}),
  ...audit,
  ...versioned,
});

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey(),
    source: text("source").$type<"local" | "google">().notNull().default("local"),
    connectionId: uuid("connection_id").references(() => connections.id),
    externalCalendarId: text("external_calendar_id"),
    externalId: text("external_id"),
    etag: text("etag"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location"),
    allDay: boolean("all_day").notNull(),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    startDate: day("start_date"),
    endDate: day("end_date"),
    managed: boolean("managed").notNull().default(false),
    taskId: uuid("task_id").references(() => tasks.id),
    status: text("status").$type<"confirmed" | "cancelled">().notNull().default("confirmed"),
    syncStatus: text("sync_status")
      .$type<"local" | "synced" | "pending" | "conflict">()
      .notNull()
      .default("local"),
    lastSyncedAt: ts("last_synced_at"),
    ...audit,
    ...softDelete,
    ...versioned,
  },
  (t) => [
    index("calendar_events_start_idx").on(t.startAt),
    index("calendar_events_start_date_idx").on(t.startDate),
    uniqueIndex("calendar_events_external_uq")
      .on(t.externalCalendarId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey(),
  kind: text("kind").$type<"calendar.create" | "calendar.update" | "calendar.delete">().notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "applied" | "rejected" | "failed" | "expired">()
    .notNull()
    .default("pending"),
  calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id),
  expectedEventVersion: integer("expected_event_version"),
  taskId: uuid("task_id").references(() => tasks.id),
  targetCalendarId: text("target_calendar_id"),
  draft: jsonb("draft").$type<CalendarEventDraft>(),
  createdBy: text("created_by").$type<"owner" | "system">().notNull().default("owner"),
  decidedAt: ts("decided_at"),
  appliedAt: ts("applied_at"),
  error: text("error"),
  ...audit,
  ...versioned,
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey(),
  sha256: text("sha256").notNull().unique(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: audit.createdAt,
});

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<"text" | "url" | "image" | "receipt">().notNull(),
    status: text("status").$type<"new" | "converted" | "archived">().notNull().default("new"),
    text: text("text"),
    url: text("url"),
    attachmentId: uuid("attachment_id").references(() => attachments.id),
    source: text("source").$type<"web" | "share" | "shortcut" | "api">().notNull(),
    capturedAt: ts("captured_at").notNull().defaultNow(),
    convertedType: text("converted_type").$type<"task" | "note" | "receipt">(),
    convertedId: uuid("converted_id"),
    archivedAt: ts("archived_at"),
    ...audit,
  },
  (t) => [index("inbox_status_idx").on(t.status)],
);

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey(),
  inboxItemId: uuid("inbox_item_id").references(() => inboxItems.id),
  attachmentId: uuid("attachment_id").references(() => attachments.id),
  status: text("status").$type<"draft" | "confirmed" | "discarded">().notNull().default("draft"),
  ocr: jsonb("ocr").$type<Receipt["ocr"]>().notNull(),
  fields: jsonb("fields").$type<Receipt["fields"]>().notNull(),
  confirmed: jsonb("confirmed").$type<Receipt["confirmed"]>(),
  confirmedAt: ts("confirmed_at"),
  ...audit,
  ...versioned,
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey(),
  kind: text("kind").$type<"weekly" | "monthly">().notNull(),
  key: text("key").notNull().unique(),
  periodStart: day("period_start").notNull(),
  periodEnd: day("period_end").notNull(),
  status: text("status").$type<"draft" | "finalized">().notNull().default("draft"),
  inputsHash: text("inputs_hash").notNull(),
  computed: jsonb("computed").$type<ReviewComputed>().notNull(),
  draft: jsonb("draft").$type<{ wins: string[]; challenges: string[]; nextFocus: string[] }>().notNull(),
  owner: jsonb("owner")
    .$type<{ wins: string; challenges: string; nextFocus: string; notes: string }>()
    .notNull(),
  generatedAt: ts("generated_at").notNull(),
  finalizedAt: ts("finalized_at"),
  ...audit,
  ...versioned,
});

export const analyses = pgTable("analyses", {
  id: uuid("id").primaryKey(),
  purpose: text("purpose").notNull(),
  noteIds: uuid("note_ids").array().notNull(),
  status: text("status")
    .$type<"previewed" | "consented" | "queued" | "running" | "completed" | "failed" | "cancelled">()
    .notNull()
    .default("previewed"),
  estimate: jsonb("estimate").$type<CostEstimate>(),
  consent: jsonb("consent").$type<{ givenAt: string; estimateKrw: string }>(),
  provider: text("provider").$type<"disconnected" | "anthropic">().notNull(),
  model: text("model"),
  resultText: text("result_text"),
  error: text("error"),
  usageId: uuid("usage_id"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  ...audit,
  ...versioned,
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey(),
    analysisId: uuid("analysis_id").references(() => analyses.id),
    monthKey: text("month_key").notNull(),
    provider: text("provider").$type<"disconnected" | "anthropic">().notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estimatedCostKrw: money("estimated_cost_krw").notNull(),
    actualCostKrw: money("actual_cost_krw"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("ai_usage_month_idx").on(t.monthKey)],
);

export const guidanceSources = pgTable("guidance_sources", {
  id: uuid("id").primaryKey(),
  topic: text("topic").$type<"labor" | "tax" | "life" | "other">().notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull(),
  checkedAt: day("checked_at").notNull(),
  effectiveDate: day("effective_date"),
  summary: text("summary").notNull().default(""),
  eligibility: text("eligibility")
    .$type<"unknown" | "applicable" | "not_applicable">()
    .notNull()
    .default("unknown"),
  ...audit,
  ...versioned,
});

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey(),
  label: text("label").notNull(),
  scope: text("scope").$type<"capture">().notNull(),
  prefix: text("prefix").notNull(),
  /** sha256 of the full secret; the secret itself is shown once and never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: audit.createdAt,
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
});

/** Idempotency ledger (NFR-002): replays the stored response for a repeated key within 24h. */
export const commandLog = pgTable(
  "command_log",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    commandId: uuid("command_id").notNull(),
    commandType: text("command_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    response: jsonb("response").notNull(),
    createdAt: audit.createdAt,
  },
  (t) => [index("command_log_created_idx").on(t.createdAt)],
);

/** Operational key/value state: worker heartbeat, last backup, etc. */
export const opsState = pgTable("ops_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: audit.updatedAt,
});

export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").primaryKey(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  ok: boolean("ok"),
  fileName: text("file_name"),
  size: bigint("size", { mode: "number" }),
  sha256: text("sha256"),
  error: text("error"),
  prunedAt: ts("pruned_at"),
});
