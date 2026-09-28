import type {
  Account,
  AiUsage,
  Analysis,
  ApiToken,
  Attachment,
  BalanceSnapshot,
  CalendarEvent,
  CheckIn,
  Collection,
  CollectionRecord,
  Connection,
  Goal,
  GuidanceSource,
  InboxItem,
  Note,
  NoteLink,
  NoteRevisionSummary,
  NoteSummary,
  Project,
  Proposal,
  Receipt,
  Review,
  Routine,
  Settings,
  Task,
} from "@liferoute/contracts";
import { excerpt, toDecimalString, dec } from "@liferoute/core";
import type * as s from "./db/schema";

/** Row → contract entity. Instants become UTC ISO strings; NUMERIC strings become canonical decimals. */
export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
export const canon = (v: string): string => toDecimalString(dec(v));
export const canonOrNull = (v: string | null): string | null => (v === null ? null : canon(v));

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export function toSettings(r: Row<typeof s.settings>): Settings {
  return {
    id: "settings",
    timezone: "Asia/Seoul",
    locale: "ko-KR",
    baseCurrency: "KRW",
    finance: r.finance,
    ai: r.ai,
    backup: r.backup,
    review: { weekStartsOn: "mon" },
    capture: r.capture,
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toGoal(r: Row<typeof s.goals>): Goal {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    targetDate: r.targetDate,
    sortOrder: r.sortOrder,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toProject(r: Row<typeof s.projects>): Project {
  return {
    id: r.id,
    goalId: r.goalId,
    title: r.title,
    doneCriteria: r.doneCriteria,
    status: r.status,
    dueDate: r.dueDate,
    sortOrder: r.sortOrder,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toTask(r: Row<typeof s.tasks>): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    projectId: r.projectId,
    goalId: r.goalId,
    dueDate: r.dueDate,
    plannedAt: isoOrNull(r.plannedAt),
    plannedDurationMin: r.plannedDurationMin,
    topDate: r.topDate,
    topRank: r.topRank,
    recurrence: r.recurrence,
    seriesId: r.seriesId,
    sortOrder: r.sortOrder,
    completedAt: isoOrNull(r.completedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toRoutine(r: Row<typeof s.routines>): Routine {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    schedule: r.schedule,
    status: r.status,
    sortOrder: r.sortOrder,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toCheckIn(r: Row<typeof s.checkIns>): CheckIn {
  return { id: r.id, routineId: r.routineId, date: r.date, status: r.status, note: r.note, recordedAt: iso(r.recordedAt) };
}

export function toAccount(r: Row<typeof s.accounts>): Account {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    category: r.category as Account["category"],
    institution: r.institution,
    currency: r.currency,
    included: r.included,
    liquid: r.liquid,
    memo: r.memo,
    sortOrder: r.sortOrder,
    archivedAt: isoOrNull(r.archivedAt),
    archiveReason: r.archiveReason,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toSnapshot(r: Row<typeof s.balanceSnapshots>): BalanceSnapshot {
  return {
    id: r.id,
    accountId: r.accountId,
    asOf: r.asOf,
    amount: canon(r.amount),
    currency: r.currency,
    fxRate: canonOrNull(r.fxRate),
    amountKrw: canon(r.amountKrw),
    estimated: r.estimated,
    reason: r.reason,
    source: r.source,
    createdAt: iso(r.createdAt),
  };
}

export function toNote(r: Row<typeof s.notes>, links: NoteLink[]): Note {
  return {
    id: r.id,
    title: r.title,
    tags: r.tags,
    projectId: r.projectId,
    goalId: r.goalId,
    document: r.document,
    text: r.text,
    links,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toNoteSummary(
  r: Pick<Row<typeof s.notes>, "id" | "title" | "tags" | "projectId" | "goalId" | "text" | "createdAt" | "updatedAt" | "deletedAt" | "version">,
  linkCount: number,
  backlinkCount: number,
): NoteSummary {
  return {
    id: r.id,
    title: r.title,
    tags: r.tags,
    projectId: r.projectId,
    goalId: r.goalId,
    excerpt: excerpt(r.text, 200),
    linkCount,
    backlinkCount,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toRevisionSummary(r: Pick<Row<typeof s.noteRevisions>, "id" | "noteId" | "version" | "title" | "savedAt">): NoteRevisionSummary {
  return { id: r.id, noteId: r.noteId, version: r.version, title: r.title, savedAt: iso(r.savedAt) };
}

export function toCollection(r: Row<typeof s.collections>): Collection {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    properties: r.properties,
    views: r.views,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toRecord(r: Row<typeof s.collectionRecords>): CollectionRecord {
  return {
    id: r.id,
    collectionId: r.collectionId,
    values: r.values,
    sortOrder: r.sortOrder,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toCalendarEvent(r: Row<typeof s.calendarEvents>): CalendarEvent {
  return {
    id: r.id,
    source: r.source,
    connectionId: r.connectionId,
    externalCalendarId: r.externalCalendarId,
    externalId: r.externalId,
    etag: r.etag,
    title: r.title,
    description: r.description,
    location: r.location,
    when: r.allDay
      ? { allDay: true, startDate: r.startDate!, endDate: r.endDate! }
      : { allDay: false, start: iso(r.startAt!), end: iso(r.endAt!) },
    managed: r.managed,
    taskId: r.taskId,
    status: r.status,
    syncStatus: r.syncStatus,
    lastSyncedAt: isoOrNull(r.lastSyncedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
    version: r.version,
  };
}

export function toProposal(r: Row<typeof s.proposals>): Proposal {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    calendarEventId: r.calendarEventId,
    expectedEventVersion: r.expectedEventVersion,
    taskId: r.taskId,
    targetCalendarId: r.targetCalendarId,
    draft: r.draft,
    createdBy: r.createdBy,
    decidedAt: isoOrNull(r.decidedAt),
    appliedAt: isoOrNull(r.appliedAt),
    error: r.error,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

/** Secrets and sync cursors are deliberately dropped here (docs/13_security). */
export function toConnection(r: Row<typeof s.connections>): Connection {
  return {
    id: r.id,
    provider: r.provider,
    status: r.status,
    label: r.label,
    scopes: r.scopes,
    meta: r.meta,
    lastSyncAt: isoOrNull(r.lastSyncAt),
    lastSuccessAt: isoOrNull(r.lastSuccessAt),
    lastError: r.lastError,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toAttachment(r: Row<typeof s.attachments>): Attachment {
  return {
    id: r.id,
    sha256: r.sha256,
    mime: r.mime as Attachment["mime"],
    size: r.size,
    originalName: r.originalName,
    createdAt: iso(r.createdAt),
  };
}

export function toInboxItem(r: Row<typeof s.inboxItems>): InboxItem {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    text: r.text,
    url: r.url,
    attachmentId: r.attachmentId,
    source: r.source,
    capturedAt: iso(r.capturedAt),
    convertedTo: r.convertedType && r.convertedId ? { type: r.convertedType, id: r.convertedId } : null,
    archivedAt: isoOrNull(r.archivedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function toReceipt(r: Row<typeof s.receipts>): Receipt {
  return {
    id: r.id,
    inboxItemId: r.inboxItemId,
    attachmentId: r.attachmentId,
    status: r.status,
    ocr: r.ocr,
    fields: r.fields,
    confirmed: r.confirmed ?? null,
    confirmedAt: isoOrNull(r.confirmedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toReview(r: Row<typeof s.reviews>): Review {
  return {
    id: r.id,
    kind: r.kind,
    key: r.key,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    inputsHash: r.inputsHash,
    computed: r.computed,
    draft: r.draft,
    owner: r.owner,
    generatedAt: iso(r.generatedAt),
    finalizedAt: isoOrNull(r.finalizedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toAnalysis(r: Row<typeof s.analyses>): Analysis {
  return {
    id: r.id,
    purpose: r.purpose,
    noteIds: r.noteIds,
    status: r.status,
    estimate: r.estimate ?? null,
    consent: r.consent ?? null,
    provider: r.provider,
    model: r.model,
    resultText: r.resultText,
    error: r.error,
    usageId: r.usageId,
    startedAt: isoOrNull(r.startedAt),
    finishedAt: isoOrNull(r.finishedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toAiUsage(r: Row<typeof s.aiUsage>): AiUsage {
  return {
    id: r.id,
    analysisId: r.analysisId,
    monthKey: r.monthKey,
    provider: r.provider,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    estimatedCostKrw: canon(r.estimatedCostKrw),
    actualCostKrw: canonOrNull(r.actualCostKrw),
    occurredAt: iso(r.occurredAt),
  };
}

export function toGuidance(r: Row<typeof s.guidanceSources>): GuidanceSource {
  return {
    id: r.id,
    topic: r.topic,
    title: r.title,
    sourceUrl: r.sourceUrl,
    checkedAt: r.checkedAt,
    effectiveDate: r.effectiveDate,
    summary: r.summary,
    eligibility: r.eligibility,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    version: r.version,
  };
}

export function toApiToken(r: Row<typeof s.apiTokens>): ApiToken {
  return {
    id: r.id,
    label: r.label,
    scope: r.scope,
    prefix: r.prefix,
    createdAt: iso(r.createdAt),
    lastUsedAt: isoOrNull(r.lastUsedAt),
    revokedAt: isoOrNull(r.revokedAt),
  };
}
