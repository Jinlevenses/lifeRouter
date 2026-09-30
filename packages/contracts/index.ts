/**
 * LifeRoute — packages/contracts/index.ts (0.1.0)
 *
 * 단일 소유자 local-first 생활 관리 서비스의 API/도메인 계약.
 * 이 파일은 docs/00_project DR-001이 "기준"으로 선언한 계약의 초안이며,
 * docs/00_project "계약을 확장하기 전 해결할 불일치" 4건과 fable-review.md의 결정을 반영한다.
 *
 * 원칙
 *  - 모든 금액은 decimal 문자열(Money). 숫자(number)로 금액을 표현하지 않는다.
 *  - 업무일은 DateOnly(YYYY-MM-DD, Asia/Seoul 달력일), 시각은 Instant(UTC ISO 8601, Z 고정).
 *  - 모든 쓰기는 typed Command 하나의 엔드포인트로 유입된다. version이 있는 자원은 expectedVersion을 요구한다.
 *  - 스키마(zod v4)가 타입의 단일 출처다. 타입은 z.infer로 파생한다.
 *  - 비밀(토큰, 키, 저장 경로)은 어떤 읽기 모델에도 포함하지 않는다.
 *
 * 원시 타입은 brand 없이 문자열이며 zod 스키마가 API 경계에서 형식을 강제한다(ADR-008).
 */
import { z } from "zod";

// ============================================================================
// 0. 상수
// ============================================================================

export const CONTRACT_VERSION = "0.1.0" as const;
export const TIMEZONE = "Asia/Seoul" as const;
export const LOCALE = "ko-KR" as const;
export const BASE_CURRENCY = "KRW" as const;
export const TOP_TASKS_PER_DAY = 3 as const;
export const AI_MONTHLY_BUDGET_KRW_DEFAULT = "3000" as const;
export const OPS_MONTHLY_BUDGET_KRW = "10000" as const;
export const FINANCE_GOAL_AMOUNT_KRW_DEFAULT = "100000000" as const;
export const FINANCE_GOAL_MONTHS_DEFAULT = 36 as const;
export const SNAPSHOT_STALE_AFTER_DAYS_DEFAULT = 35 as const;
export const NOTE_DOCUMENT_MAX_BYTES = 1_000_000 as const;
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;
export const IDEMPOTENCY_TTL_HOURS = 24 as const;

export const API_ROUTES = {
  workspace: "/api/v1/workspace",
  commands: "/api/v1/commands",
  note: "/api/v1/notes/:noteId",
  noteRevision: "/api/v1/notes/:noteId/revisions/:revisionId",
  noteMarkdown: "/api/v1/notes/:noteId/export.md",
  export: "/api/v1/export",
  attachments: "/api/v1/attachments",
  attachment: "/api/v1/attachments/:attachmentId",
  capture: "/api/v1/capture",
  authGoogleStart: "/api/v1/auth/google",
  authGoogleCallback: "/api/v1/auth/google/callback",
  health: "/api/v1/health",
} as const;

/** pg-boss job 이름. singletonKey로 중복 실행을 막는다. */
export const JOB_NAMES = {
  googleSync: "google.sync",
  googleApplyProposal: "google.applyProposal",
  tossSync: "toss.sync",
  receiptOcr: "receipt.ocr",
  aiAnalysis: "ai.analysis",
  backupDaily: "backup.daily",
  idempotencyPrune: "idempotency.prune",
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ============================================================================
// 1. 원시 타입 (API 경계에서 zod로 검증되는 문자열)
// ============================================================================

/** 부호 있는 십진수. 지수·천단위 구분자 금지, 소수 최대 4자리. KRW는 core에서 정수로 반올림한다. */
export const MONEY_RE = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
export const MoneySchema = z
  .string()
  .regex(MONEY_RE, { error: "Money는 decimal 문자열이어야 합니다 (예: '1500000', '-12.50')" });
export type Money = z.infer<typeof MoneySchema>;

export const DATE_ONLY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
export function isValidCalendarDate(s: string): boolean {
  if (!DATE_ONLY_RE.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}
/** Asia/Seoul 달력일. 시간대 정보 없음. */
export const DateOnlySchema = z
  .string()
  .refine(isValidCalendarDate, { error: "DateOnly는 실재하는 YYYY-MM-DD여야 합니다" });
export type DateOnly = z.infer<typeof DateOnlySchema>;

export const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** UTC ISO 8601, 항상 'Z' 종결. 오프셋 표기는 거부한다. */
export const InstantSchema = z
  .string()
  .regex(INSTANT_RE, { error: "Instant는 UTC ISO 8601(Z)이어야 합니다" })
  .refine((s) => !Number.isNaN(Date.parse(s)), { error: "Instant를 해석할 수 없습니다" });
export type Instant = z.infer<typeof InstantSchema>;

/** UUID (서버 생성 기본, 클라이언트 optimistic 생성 허용). */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** 'YYYY-MM' (Asia/Seoul 기준 월). AI 원장·검토 키에 사용. */
export const MonthKeySchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
export type MonthKey = z.infer<typeof MonthKeySchema>;

/** ISO 4217 통화 코드. */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export type Currency = z.infer<typeof CurrencySchema>;

export const VersionSchema = z.number().int().min(1);
export type Version = z.infer<typeof VersionSchema>;

export const IdempotencyKeySchema = z.string().min(8).max(128);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

/** 태그: 소문자·trim·'#' 제거 후 저장. */
export const TagSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[^#\s,][^#,]*$/, { error: "태그에는 '#', ','를 쓸 수 없습니다" });
export type Tag = z.infer<typeof TagSchema>;

export const ShortTextSchema = z.string().min(1).max(200);
export const LongTextSchema = z.string().max(4000);

/** 값을 검증하고 그대로 돌려주는 헬퍼(테스트·core용). */
export const money = (v: string): Money => MoneySchema.parse(v);
export const dateOnly = (v: string): DateOnly => DateOnlySchema.parse(v);
export const instant = (v: string): Instant => InstantSchema.parse(v);
export const id = (v: string): Id => IdSchema.parse(v);

// ----------------------------------------------------------------------------
// 공통 필드 조각
// ----------------------------------------------------------------------------
const auditFields = { createdAt: InstantSchema, updatedAt: InstantSchema };
const softDeleteFields = { deletedAt: InstantSchema.nullable() };
const versionFields = { version: VersionSchema };

// ============================================================================
// 2. 반복 규칙 (Recurrence)
// ============================================================================
/**
 * 결정
 *  - kind: daily | weekday(월~금) | weekly(weekdays 배열) | monthly(day 1..31 또는 'last').
 *  - weekday는 weekly{mon..fri}의 설탕이며 core에서 정규화한다.
 *  - monthly.day가 해당 월 일수보다 크면 그 달의 말일로 clamp한다.
 *  - startDate 이후(포함)만 발생시킨다. endDate는 포함 경계.
 *  - interval(격주 등)은 v1 범위 밖.
 */
export const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof WeekdaySchema>;

const recurrenceBase = {
  startDate: DateOnlySchema,
  endDate: DateOnlySchema.nullable(),
};
export const RecurrenceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("daily"), ...recurrenceBase }),
    z.object({ kind: z.literal("weekday"), ...recurrenceBase }),
    z.object({
      kind: z.literal("weekly"),
      weekdays: z.array(WeekdaySchema).min(1).max(7),
      ...recurrenceBase,
    }),
    z.object({
      kind: z.literal("monthly"),
      day: z.union([z.number().int().min(1).max(31), z.literal("last")]),
      ...recurrenceBase,
    }),
  ])
  .refine((r) => r.endDate === null || r.endDate >= r.startDate, {
    error: "endDate는 startDate 이후여야 합니다",
  });
export type Recurrence = z.infer<typeof RecurrenceSchema>;

// ============================================================================
// 3. 엔티티
// ============================================================================

// ---------------------------------------------------------------- Goal / Project / Task
export const GoalStatusSchema = z.enum(["active", "achieved", "dropped"]);
export const GoalSchema = z.object({
  id: IdSchema,
  title: ShortTextSchema,
  description: LongTextSchema,
  status: GoalStatusSchema,
  targetDate: DateOnlySchema.nullable(),
  sortOrder: z.number().int(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
});
export type Goal = z.infer<typeof GoalSchema>;

export const ProjectStatusSchema = z.enum(["active", "done", "dropped"]);
export const ProjectSchema = z.object({
  id: IdSchema,
  goalId: IdSchema.nullable(),
  title: ShortTextSchema,
  /** 완료 기준(01_product: Project는 완료 기준) */
  doneCriteria: LongTextSchema,
  status: ProjectStatusSchema,
  dueDate: DateOnlySchema.nullable(),
  sortOrder: z.number().int(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
});
export type Project = z.infer<typeof ProjectSchema>;

export const TaskStatusSchema = z.enum(["open", "done", "cancelled"]);
export const TopRankSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type TopRank = z.infer<typeof TopRankSchema>;

const taskShape = {
  id: IdSchema,
  title: ShortTextSchema,
  description: LongTextSchema,
  status: TaskStatusSchema,
  projectId: IdSchema.nullable(),
  goalId: IdSchema.nullable(),
  /** 마감일(DateOnly). */
  dueDate: DateOnlySchema.nullable(),
  /** 캘린더 배치 시각(Instant). dueDate와 독립. */
  plannedAt: InstantSchema.nullable(),
  plannedDurationMin: z.number().int().min(5).max(1440).nullable(),
  /** 오늘의 상위 3개: topDate === today 인 open 작업. 같은 날 최대 3개, rank 유일. */
  topDate: DateOnlySchema.nullable(),
  topRank: TopRankSchema.nullable(),
  /** 반복 템플릿 규칙. 완료 시 다음 발생(dueDate 기준)을 새 Task로 생성한다. */
  recurrence: RecurrenceSchema.nullable(),
  /** 같은 반복 계열의 식별자(첫 Task id). */
  seriesId: IdSchema.nullable(),
  sortOrder: z.number().int(),
  completedAt: InstantSchema.nullable(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
};
export const TaskSchema = z
  .object(taskShape)
  .refine((t) => (t.topDate === null) === (t.topRank === null), {
    error: "topDate와 topRank는 함께 설정/해제되어야 합니다",
  })
  .refine((t) => t.recurrence === null || t.dueDate !== null, {
    error: "반복 작업은 dueDate가 필요합니다",
  });
export type Task = z.infer<typeof TaskSchema>;

// ---------------------------------------------------------------- Routine / CheckIn
export const RoutineStatusSchema = z.enum(["active", "paused", "archived"]);
export const RoutineSchema = z.object({
  id: IdSchema,
  title: ShortTextSchema,
  description: LongTextSchema,
  /** 기대 일자 규칙. 기대일이 아니면 unrecorded로 세지 않는다. */
  schedule: RecurrenceSchema,
  status: RoutineStatusSchema,
  sortOrder: z.number().int(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
});
export type Routine = z.infer<typeof RoutineSchema>;

/** 미기록(unrecorded)은 행 부재다. status에 'unrecorded'는 존재하지 않는다. */
export const CheckInStatusSchema = z.enum(["done", "skipped"]);
export const CheckInSchema = z.object({
  id: IdSchema,
  routineId: IdSchema,
  /** unique(routineId, date) */
  date: DateOnlySchema,
  status: CheckInStatusSchema,
  note: z.string().max(500).nullable(),
  recordedAt: InstantSchema,
});
export type CheckIn = z.infer<typeof CheckInSchema>;

/** 파생 표시 상태(읽기 모델 전용). */
export const RoutineDayStateSchema = z.enum(["done", "skipped", "unrecorded", "notExpected"]);
export type RoutineDayState = z.infer<typeof RoutineDayStateSchema>;

// ---------------------------------------------------------------- Account / BalanceSnapshot
export const AccountKindSchema = z.enum(["asset", "liability"]);
export const ASSET_CATEGORIES = [
  "cash",
  "deposit",
  "savings",
  "investment",
  "pension",
  "realEstate",
  "otherAsset",
] as const;
export const LIABILITY_CATEGORIES = ["loan", "creditCard", "otherLiability"] as const;
export const AccountCategorySchema = z.enum([...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES]);
export type AccountCategory = z.infer<typeof AccountCategorySchema>;

const accountShape = {
  id: IdSchema,
  name: ShortTextSchema,
  kind: AccountKindSchema,
  category: AccountCategorySchema,
  institution: z.string().max(100).nullable(),
  currency: CurrencySchema,
  /**
   * 결정(불일치 1): included는 자산에만 의미가 있다. 부채는 항상 included=true, liquid=false.
   * 부채를 순자산에서 빼고 싶다면 제외가 아니라 archive(사유 필수)로 처리한다.
   */
  included: z.boolean(),
  liquid: z.boolean(),
  memo: z.string().max(1000).nullable(),
  sortOrder: z.number().int(),
  archivedAt: InstantSchema.nullable(),
  archiveReason: z.string().max(500).nullable(),
  ...auditFields,
  ...versionFields,
};
const isAssetCategory = (c: AccountCategory): boolean => (ASSET_CATEGORIES as readonly string[]).includes(c);
export const AccountSchema = z
  .object(accountShape)
  .refine((a) => a.kind !== "liability" || (a.included && !a.liquid), {
    error: "부채는 항상 included=true, liquid=false 입니다",
  })
  .refine((a) => (a.kind === "asset") === isAssetCategory(a.category), {
    error: "category가 kind와 맞지 않습니다",
  })
  .refine((a) => a.archivedAt === null || (a.archiveReason ?? "").trim().length > 0, {
    error: "archive에는 사유가 필요합니다",
  });
export type Account = z.infer<typeof AccountSchema>;

/** Q-2: 토스뱅크 잔액과 토스증권 잔고를 따로 가져온다(공식 API 연결 전에는 manual). */
export const SnapshotSourceSchema = z.enum(["manual", "toss_bank", "toss_securities"]);
const snapshotShape = {
  id: IdSchema,
  accountId: IdSchema,
  /** unique(accountId, asOf). 평가 기준일. */
  asOf: DateOnlySchema,
  /** 계정 통화 기준 금액. 부채는 '갚아야 할 양수 금액'. */
  amount: MoneySchema,
  currency: CurrencySchema,
  /** KRW/1단위. currency !== 'KRW'일 때 필수. */
  fxRate: MoneySchema.nullable(),
  /** 서버 파생: round_half_up(amount × fxRate, 0). KRW면 amount와 동일. */
  amountKrw: MoneySchema,
  estimated: z.boolean(),
  reason: z.string().max(500).nullable(),
  source: SnapshotSourceSchema,
  createdAt: InstantSchema,
};
export const BalanceSnapshotSchema = z
  .object(snapshotShape)
  .refine((s) => !s.estimated || (s.reason ?? "").trim().length > 0, {
    error: "estimated=true 인 snapshot은 reason이 필수입니다",
  })
  .refine((s) => s.currency === BASE_CURRENCY || s.fxRate !== null, {
    error: "외화 snapshot은 fxRate가 필요합니다",
  });
export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;

// ---------------------------------------------------------------- Note / DocumentNode / Revision
export const DOCUMENT_NODE_TYPES = [
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "noteLink",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
] as const;
export const DOCUMENT_MARK_TYPES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
] as const;
export const DocumentNodeTypeSchema = z.enum(DOCUMENT_NODE_TYPES);
export const DocumentMarkTypeSchema = z.enum(DOCUMENT_MARK_TYPES);
export type DocumentNodeType = z.infer<typeof DocumentNodeTypeSchema>;
export type DocumentMarkType = z.infer<typeof DocumentMarkTypeSchema>;

export interface DocumentMark {
  type: DocumentMarkType;
  attrs?: Record<string, unknown>;
}
/** Tiptap/ProseMirror JSON. 허용 목록 밖의 node/mark type은 422로 거부한다. */
export interface DocumentNode {
  type: DocumentNodeType;
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  marks?: DocumentMark[];
  text?: string;
}
export const DocumentMarkSchema: z.ZodType<DocumentMark> = z.object({
  type: DocumentMarkTypeSchema,
  attrs: z.record(z.string(), z.unknown()).optional(),
});
export const DocumentNodeSchema: z.ZodType<DocumentNode> = z.lazy(() =>
  z.object({
    type: DocumentNodeTypeSchema,
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(DocumentNodeSchema).optional(),
    marks: z.array(DocumentMarkSchema).optional(),
    text: z.string().optional(),
  }),
);
/** 노트 루트 문서: type === 'doc'. */
export const NoteDocumentSchema = DocumentNodeSchema.refine((d) => d.type === "doc", {
  error: "노트 문서의 루트는 'doc'이어야 합니다",
});

/**
 * 결정(불일치 3): backlink는 inline atom node `noteLink`로 표현한다.
 *   { type: 'noteLink', attrs: { targetType: 'note'|'project'|'goal'|'task', targetId: Id, label: string } }
 * 저장 시 서버가 문서를 순회해 noteLink를 추출하여 NoteLink 행으로 전량 교체한다.
 * Markdown export: `[label](liferoute://<targetType>/<targetId>)`.
 * image node attrs: { attachmentId: Id, alt?: string }.
 */
export const LinkTargetTypeSchema = z.enum(["note", "project", "goal", "task"]);
export type LinkTargetType = z.infer<typeof LinkTargetTypeSchema>;
export const NoteLinkAttrsSchema = z.object({
  targetType: LinkTargetTypeSchema,
  targetId: IdSchema,
  label: z.string().max(200),
});
export type NoteLinkAttrs = z.infer<typeof NoteLinkAttrsSchema>;
export const ImageAttrsSchema = z.object({
  attachmentId: IdSchema,
  alt: z.string().max(200).optional(),
});

export const NoteLinkSchema = z.object({
  sourceNoteId: IdSchema,
  targetType: LinkTargetTypeSchema,
  targetId: IdSchema,
  label: z.string().max(200),
});
export type NoteLink = z.infer<typeof NoteLinkSchema>;

const noteMetaShape = {
  id: IdSchema,
  title: z.string().max(300),
  tags: z.array(TagSchema).max(20),
  /** 소속(첨부) 관계. backlink 계산에 포함된다. */
  projectId: IdSchema.nullable(),
  goalId: IdSchema.nullable(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
};
export const NoteSchema = z.object({
  ...noteMetaShape,
  document: NoteDocumentSchema,
  /** 서버 파생: text node를 줄바꿈으로 이어붙인 검색용 평문. 클라이언트는 보내지 않는다. */
  text: z.string(),
  /** 서버 파생: 이 노트가 가리키는 링크(outgoing). */
  links: z.array(NoteLinkSchema),
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteSummarySchema = z.object({
  ...noteMetaShape,
  excerpt: z.string().max(200),
  linkCount: z.number().int().min(0),
  backlinkCount: z.number().int().min(0),
});
export type NoteSummary = z.infer<typeof NoteSummarySchema>;

export const NoteRevisionSchema = z.object({
  id: IdSchema,
  noteId: IdSchema,
  /** 이 revision이 보존하는 '이전' 버전 번호. */
  version: VersionSchema,
  title: z.string().max(300),
  document: NoteDocumentSchema,
  text: z.string(),
  savedAt: InstantSchema,
});
export type NoteRevision = z.infer<typeof NoteRevisionSchema>;
export const NoteRevisionSummarySchema = NoteRevisionSchema.omit({ document: true, text: true });
export type NoteRevisionSummary = z.infer<typeof NoteRevisionSummarySchema>;

export const NoteDetailSchema = z.object({
  note: NoteSchema,
  revisions: z.array(NoteRevisionSummarySchema),
  /** 이 노트를 가리키는 링크(incoming). */
  backlinks: z.array(NoteLinkSchema),
});
export type NoteDetail = z.infer<typeof NoteDetailSchema>;

// ---------------------------------------------------------------- Collection
export const PropertyTypeSchema = z.enum([
  "text",
  "number",
  "money",
  "date",
  "checkbox",
  "status",
  "select",
  "multiSelect",
  "url",
  "relation",
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const PropertyIdSchema = z.string().min(1).max(64);
export const SelectOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  color: z.string().max(32).nullable(),
});
export type SelectOption = z.infer<typeof SelectOptionSchema>;

export const CollectionPropertySchema = z
  .object({
    id: PropertyIdSchema,
    name: z.string().min(1).max(100),
    type: PropertyTypeSchema,
    /** status/select/multiSelect 전용. 그 외 빈 배열. */
    options: z.array(SelectOptionSchema).max(100),
    /** relation 전용. */
    relationCollectionId: IdSchema.nullable(),
    required: z.boolean(),
    sortOrder: z.number().int(),
  })
  .refine((p) => p.type !== "relation" || p.relationCollectionId !== null, {
    error: "relation 속성은 relationCollectionId가 필요합니다",
  });
export type CollectionProperty = z.infer<typeof CollectionPropertySchema>;

export const PropertyValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().max(4000) }),
  z.object({ type: z.literal("number"), value: z.number().finite() }),
  z.object({ type: z.literal("money"), value: MoneySchema, currency: CurrencySchema }),
  z.object({ type: z.literal("date"), value: DateOnlySchema }),
  z.object({ type: z.literal("checkbox"), value: z.boolean() }),
  z.object({ type: z.literal("status"), value: z.string().min(1).max(64) }),
  z.object({ type: z.literal("select"), value: z.string().min(1).max(64).nullable() }),
  z.object({ type: z.literal("multiSelect"), value: z.array(z.string().min(1).max(64)).max(50) }),
  z.object({ type: z.literal("url"), value: z.url() }),
  z.object({ type: z.literal("relation"), value: z.array(IdSchema).max(200) }),
]);
export type PropertyValue = z.infer<typeof PropertyValueSchema>;

export const SortDirectionSchema = z.enum(["asc", "desc"]);
export const ViewSortSchema = z.object({ propertyId: PropertyIdSchema, direction: SortDirectionSchema });
export const FilterOpSchema = z.enum(["eq", "neq", "contains", "isEmpty", "isNotEmpty", "gt", "lt"]);
export const ViewFilterSchema = z.object({
  propertyId: PropertyIdSchema,
  op: FilterOpSchema,
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
});
export const CollectionViewSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(100),
    kind: z.enum(["table", "board", "calendar"]),
    /** board 전용: status/select 속성. */
    groupByPropertyId: PropertyIdSchema.nullable(),
    /** calendar 전용: date 속성. */
    datePropertyId: PropertyIdSchema.nullable(),
    sorts: z.array(ViewSortSchema).max(5),
    filters: z.array(ViewFilterSchema).max(10),
    visiblePropertyIds: z.array(PropertyIdSchema),
  })
  .refine((v) => v.kind !== "board" || v.groupByPropertyId !== null, {
    error: "board view는 groupByPropertyId가 필요합니다",
  })
  .refine((v) => v.kind !== "calendar" || v.datePropertyId !== null, {
    error: "calendar view는 datePropertyId가 필요합니다",
  });
export type CollectionView = z.infer<typeof CollectionViewSchema>;

export const CollectionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable(),
  properties: z.array(CollectionPropertySchema).max(50),
  views: z.array(CollectionViewSchema).min(1).max(20),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
});
export type Collection = z.infer<typeof CollectionSchema>;

/** values의 키는 property id. 서버는 알 수 없는 키, type 불일치, 없는 option id, required 누락을 422로 거부한다. */
export const CollectionRecordSchema = z.object({
  id: IdSchema,
  collectionId: IdSchema,
  values: z.record(PropertyIdSchema, PropertyValueSchema),
  sortOrder: z.number().int(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
});
export type CollectionRecord = z.infer<typeof CollectionRecordSchema>;

// ---------------------------------------------------------------- CalendarEvent / Proposal / Connection
export const EventWhenSchema = z.discriminatedUnion("allDay", [
  z
    .object({ allDay: z.literal(false), start: InstantSchema, end: InstantSchema })
    .refine((w) => w.end > w.start, { error: "end는 start 이후여야 합니다" }),
  z
    .object({ allDay: z.literal(true), startDate: DateOnlySchema, endDate: DateOnlySchema })
    .refine((w) => w.endDate >= w.startDate, { error: "endDate는 startDate 이후여야 합니다" }),
]);
export type EventWhen = z.infer<typeof EventWhenSchema>;

export const CalendarSourceSchema = z.enum(["local", "google"]);
export const EventSyncStatusSchema = z.enum(["local", "synced", "pending", "conflict"]);
const calendarEventShape = {
  id: IdSchema,
  source: CalendarSourceSchema,
  connectionId: IdSchema.nullable(),
  externalCalendarId: z.string().max(200).nullable(),
  externalId: z.string().max(200).nullable(),
  etag: z.string().max(200).nullable(),
  title: z.string().max(300),
  description: LongTextSchema,
  location: z.string().max(300).nullable(),
  when: EventWhenSchema,
  /**
   * managed=true: LifeRoute가 Proposal 승인으로 만든 이벤트. 이 이벤트만 update/delete Proposal 대상.
   * 외부(Google)에서 온 managed=false 이벤트는 읽기 전용이다.
   */
  managed: z.boolean(),
  taskId: IdSchema.nullable(),
  status: z.enum(["confirmed", "cancelled"]),
  syncStatus: EventSyncStatusSchema,
  lastSyncedAt: InstantSchema.nullable(),
  ...auditFields,
  ...softDeleteFields,
  ...versionFields,
};
export const CalendarEventSchema = z
  .object(calendarEventShape)
  .refine((e) => e.source !== "google" || (e.connectionId !== null && e.externalId !== null), {
    error: "google 이벤트는 connectionId/externalId가 필요합니다",
  });
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

/** Proposal이 만들/바꿀 이벤트 초안. */
export const CalendarEventDraftSchema = z.object({
  title: z.string().min(1).max(300),
  description: LongTextSchema,
  location: z.string().max(300).nullable(),
  when: EventWhenSchema,
});
export type CalendarEventDraft = z.infer<typeof CalendarEventDraftSchema>;

export const ProposalKindSchema = z.enum(["calendar.create", "calendar.update", "calendar.delete"]);
export const ProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "applied",
  "rejected",
  "failed",
  "expired",
]);
export const ProposalSchema = z
  .object({
    id: IdSchema,
    kind: ProposalKindSchema,
    status: ProposalStatusSchema,
    /** update/delete 대상(managed 이벤트). */
    calendarEventId: IdSchema.nullable(),
    /** 승인 시점에 검사할 이벤트 expected version. */
    expectedEventVersion: VersionSchema.nullable(),
    taskId: IdSchema.nullable(),
    targetCalendarId: z.string().max(200).nullable(),
    /** create/update 전용. */
    draft: CalendarEventDraftSchema.nullable(),
    createdBy: z.enum(["owner", "system"]),
    decidedAt: InstantSchema.nullable(),
    appliedAt: InstantSchema.nullable(),
    /** 실패 사유(비밀 마스킹). */
    error: z.string().max(1000).nullable(),
    ...auditFields,
    ...versionFields,
  })
  .refine((p) => p.kind === "calendar.delete" || p.draft !== null, {
    error: "create/update Proposal은 draft가 필요합니다",
  })
  .refine((p) => p.kind === "calendar.create" || p.calendarEventId !== null, {
    error: "update/delete Proposal은 calendarEventId가 필요합니다",
  });
export type Proposal = z.infer<typeof ProposalSchema>;

export const ConnectionProviderSchema = z.enum(["google", "toss_bank", "toss_securities", "ai"]);
export type ConnectionProvider = z.infer<typeof ConnectionProviderSchema>;
export const ConnectionStatusSchema = z.enum([
  "disconnected",
  "connected",
  "reauth_required",
  "stale",
  "failed",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
/** 토큰·키·sync cursor는 서버 전용이며 여기 포함되지 않는다. */
export const ConnectionSchema = z.object({
  id: IdSchema,
  provider: ConnectionProviderSchema,
  status: ConnectionStatusSchema,
  label: z.string().max(200).nullable(),
  scopes: z.array(z.string().max(200)),
  /** google: 읽는 calendar id 목록, 쓰기 대상 managed calendar id. */
  meta: z.object({
    calendarIds: z.array(z.string()).optional(),
    managedCalendarId: z.string().nullable().optional(),
    tossAccountIds: z.array(IdSchema).optional(),
  }),
  lastSyncAt: InstantSchema.nullable(),
  lastSuccessAt: InstantSchema.nullable(),
  lastError: z.string().max(1000).nullable(),
  ...auditFields,
  ...versionFields,
});
export type Connection = z.infer<typeof ConnectionSchema>;

// ---------------------------------------------------------------- Settings
export const RetentionPolicySchema = z.object({
  daily: z.number().int().min(1).max(60),
  weekly: z.number().int().min(0).max(52),
  monthly: z.number().int().min(0).max(120),
});
/** Q-4: 기본은 꺼짐, 켜면 OpenAI GPT. Anthropic은 선택지로 남긴다(ADR-013). */
export const AiProviderSchema = z.enum(["disconnected", "openai", "anthropic"]);
export const FinanceSettingsSchema = z.object({
  goalAmountKrw: MoneySchema,
  /** 소유자 생성 시 startDate=그날, targetDate=startDate+36개월로 저장(재계산하지 않음). */
  goalStartDate: DateOnlySchema,
  goalTargetDate: DateOnlySchema,
  /** 최신 snapshot.asOf가 오늘 기준 이 일수보다 오래되면 stale. */
  staleAfterDays: z.number().int().min(1).max(365),
});
export const AiSettingsSchema = z.object({
  monthlyBudgetKrw: MoneySchema,
  provider: AiProviderSchema,
  model: z.string().max(100).nullable(),
  /** 소유자가 입력하는 단가(KRW / 1M tokens). 없으면 preview 불가. */
  inputKrwPer1MTokens: MoneySchema.nullable(),
  outputKrwPer1MTokens: MoneySchema.nullable(),
  /** 토큰 추정: ceil(chars / charsPerToken). 한국어 보수 기본값 2. */
  charsPerToken: z.number().min(1).max(10),
  /** 출력 토큰 추정 상한(요약 응답). */
  maxOutputTokens: z.number().int().min(100).max(20000),
});
export const BackupSettingsSchema = z.object({
  enabled: z.boolean(),
  /** 'HH:mm' Asia/Seoul */
  dailyAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  retention: RetentionPolicySchema,
});
export const CaptureSettingsSchema = z.object({
  defaultConvertTarget: z.enum(["task", "note"]),
});
export const SettingsSchema = z
  .object({
    id: z.literal("settings"),
    timezone: z.literal(TIMEZONE),
    locale: z.literal(LOCALE),
    baseCurrency: z.literal(BASE_CURRENCY),
    finance: FinanceSettingsSchema,
    ai: AiSettingsSchema,
    backup: BackupSettingsSchema,
    review: z.object({
      /** ISO 주(월요일 시작) 고정. */
      weekStartsOn: z.literal("mon"),
    }),
    capture: CaptureSettingsSchema,
    updatedAt: InstantSchema,
    ...versionFields,
  })
  .refine((s) => s.finance.goalTargetDate > s.finance.goalStartDate, {
    error: "goalTargetDate는 goalStartDate 이후여야 합니다",
  });
export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------- Inbox / Attachment / Receipt
export const AttachmentSchema = z.object({
  id: IdSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  mime: z.enum(ATTACHMENT_ALLOWED_MIME),
  size: z.number().int().min(1).max(ATTACHMENT_MAX_BYTES),
  originalName: z.string().max(255),
  createdAt: InstantSchema,
  /** 저장 경로는 노출하지 않는다. 다운로드는 API_ROUTES.attachment. */
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const InboxKindSchema = z.enum(["text", "url", "image", "receipt"]);
export const InboxStatusSchema = z.enum(["new", "converted", "archived"]);
export const InboxSourceSchema = z.enum(["web", "share", "shortcut", "api"]);
export const InboxConvertedRefSchema = z.object({
  type: z.enum(["task", "note", "receipt"]),
  id: IdSchema,
});
export const InboxItemSchema = z
  .object({
    id: IdSchema,
    kind: InboxKindSchema,
    status: InboxStatusSchema,
    text: z.string().max(20000).nullable(),
    url: z.url().nullable(),
    attachmentId: IdSchema.nullable(),
    source: InboxSourceSchema,
    capturedAt: InstantSchema,
    /** new → converted 전이의 대상. */
    convertedTo: InboxConvertedRefSchema.nullable(),
    archivedAt: InstantSchema.nullable(),
    ...auditFields,
  })
  .refine((i) => (i.status === "converted") === (i.convertedTo !== null), {
    error: "converted 상태는 convertedTo가 필요합니다",
  })
  .refine((i) => (i.status === "archived") === (i.archivedAt !== null), {
    error: "archived 상태는 archivedAt이 필요합니다",
  });
export type InboxItem = z.infer<typeof InboxItemSchema>;

export const OcrStatusSchema = z.enum(["unavailable", "pending", "done", "failed"]);
const receiptField = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    /** 0..1, OCR 값에만 존재. */
    confidence: z.number().min(0).max(1).nullable(),
    source: z.enum(["none", "ocr", "owner"]),
  });
export const ReceiptFieldsSchema = z.object({
  merchant: receiptField(z.string().max(200)),
  amount: receiptField(MoneySchema),
  currency: receiptField(CurrencySchema),
  date: receiptField(DateOnlySchema),
});
export type ReceiptFields = z.infer<typeof ReceiptFieldsSchema>;

export const ReceiptStatusSchema = z.enum(["draft", "confirmed", "discarded"]);
export const ReceiptConfirmedSchema = z.object({
  merchant: z.string().min(1).max(200),
  amountKrw: MoneySchema,
  date: DateOnlySchema,
  category: z.string().max(50).nullable(),
  memo: z.string().max(500).nullable(),
});
export type ReceiptConfirmed = z.infer<typeof ReceiptConfirmedSchema>;

/**
 * 결정: 확정된 Receipt는 '지출 기록'이며 계정 잔액/순자산에 영향을 주지 않는다(잔액은 snapshot만).
 * 월간 검토의 spendingKrw는 confirmed Receipt 합계다.
 */
export const ReceiptSchema = z
  .object({
    id: IdSchema,
    inboxItemId: IdSchema.nullable(),
    attachmentId: IdSchema.nullable(),
    status: ReceiptStatusSchema,
    ocr: z.object({
      status: OcrStatusSchema,
      engine: z.string().max(50).nullable(),
      rawText: z.string().max(20000).nullable(),
      finishedAt: InstantSchema.nullable(),
      error: z.string().max(500).nullable(),
    }),
    fields: ReceiptFieldsSchema,
    confirmed: ReceiptConfirmedSchema.nullable(),
    confirmedAt: InstantSchema.nullable(),
    ...auditFields,
    ...versionFields,
  })
  .refine((r) => (r.status === "confirmed") === (r.confirmed !== null && r.confirmedAt !== null), {
    error: "confirmed 상태는 confirmed 필드와 confirmedAt이 필요합니다",
  });
export type Receipt = z.infer<typeof ReceiptSchema>;

// ---------------------------------------------------------------- Review
/**
 * 결정(불일치 4)
 *  - kind: weekly(ISO 주, 월~일) | monthly(달력월). 경계는 Asia/Seoul 달력일.
 *  - key: 'weekly:YYYY-Www' | 'monthly:YYYY-MM'. unique(key). 재생성은 같은 key를 upsert한다.
 *  - computed는 결정론적(inputsHash로 확인). 소유자 편집(owner)은 재생성 시 보존한다.
 */
export const ReviewKindSchema = z.enum(["weekly", "monthly"]);
export type ReviewKind = z.infer<typeof ReviewKindSchema>;
export const ReviewKeySchema = z
  .string()
  .regex(/^(?:weekly:\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])|monthly:\d{4}-(?:0[1-9]|1[0-2]))$/);
export const ReviewStatusSchema = z.enum(["draft", "finalized"]);

export const RoutineReviewRowSchema = z.object({
  routineId: IdSchema,
  expected: z.number().int().min(0),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  unrecorded: z.number().int().min(0),
});
export const ReviewComputedSchema = z.object({
  completedTasks: z.object({ count: z.number().int().min(0), taskIds: z.array(IdSchema) }),
  /** 기간 내 dueDate가 있었으나 기간 종료 시점에 open인 작업. */
  overdueTasks: z.object({ count: z.number().int().min(0), taskIds: z.array(IdSchema) }),
  routines: z.array(RoutineReviewRowSchema),
  netWorth: z.object({
    /** periodStart 전일 기준 / periodEnd 기준 순자산. snapshot이 없으면 null. */
    startKrw: MoneySchema.nullable(),
    endKrw: MoneySchema.nullable(),
    deltaKrw: MoneySchema.nullable(),
    incomplete: z.boolean(),
  }),
  spendingKrw: MoneySchema,
  notesCreated: z.number().int().min(0),
  checkInsRecorded: z.number().int().min(0),
});
export type ReviewComputed = z.infer<typeof ReviewComputedSchema>;

export const ReviewDraftSchema = z.object({
  wins: z.array(z.string().max(300)).max(10),
  challenges: z.array(z.string().max(300)).max(10),
  nextFocus: z.array(z.string().max(300)).max(10),
});
export const ReviewOwnerTextSchema = z.object({
  wins: z.string().max(4000),
  challenges: z.string().max(4000),
  nextFocus: z.string().max(4000),
  notes: z.string().max(8000),
});
export type ReviewOwnerText = z.infer<typeof ReviewOwnerTextSchema>;

export const ReviewSchema = z
  .object({
    id: IdSchema,
    kind: ReviewKindSchema,
    key: ReviewKeySchema,
    periodStart: DateOnlySchema,
    /** 포함 경계. */
    periodEnd: DateOnlySchema,
    status: ReviewStatusSchema,
    /** 입력 정규화 후 sha256. 같은 입력 → 같은 computed/draft. */
    inputsHash: z.string().regex(/^[0-9a-f]{64}$/),
    computed: ReviewComputedSchema,
    draft: ReviewDraftSchema,
    owner: ReviewOwnerTextSchema,
    generatedAt: InstantSchema,
    finalizedAt: InstantSchema.nullable(),
    ...auditFields,
    ...versionFields,
  })
  .refine((r) => r.periodEnd >= r.periodStart, { error: "periodEnd는 periodStart 이후여야 합니다" });
export type Review = z.infer<typeof ReviewSchema>;

// ---------------------------------------------------------------- Analysis / AiUsage
/**
 * 결정(불일치 2): AiUsage 원장이 월 3,000 KRW 한도의 기준이다.
 *  - usedKrw(month) = Σ(actualCostKrw ?? estimatedCostKrw) over AiUsage where monthKey = 이번 달(Asia/Seoul).
 *  - reservedKrw = Σ estimate of Analysis in status consented|queued|running (아직 원장 미기록).
 *  - preview.estimate + usedKrw + reservedKrw > budgetKrw → AI_BUDGET_EXCEEDED.
 */
export const AnalysisStatusSchema = z.enum([
  "previewed",
  "consented",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const CostEstimateSchema = z.object({
  chars: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  costKrw: MoneySchema,
  monthKey: MonthKeySchema,
  budgetKrw: MoneySchema,
  usedKrw: MoneySchema,
  reservedKrw: MoneySchema,
  remainingKrw: MoneySchema,
  computedAt: InstantSchema,
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const AnalysisSchema = z.object({
  id: IdSchema,
  purpose: z.string().min(1).max(500),
  /** 동의된 원문. 이 목록 밖의 데이터는 전송하지 않는다. */
  noteIds: z.array(IdSchema).min(1).max(50),
  status: AnalysisStatusSchema,
  estimate: CostEstimateSchema.nullable(),
  consent: z
    .object({
      givenAt: InstantSchema,
      /** 동의 당시 표시된 예상 비용. execute 시 estimate.costKrw와 일치해야 한다. */
      estimateKrw: MoneySchema,
    })
    .nullable(),
  provider: AiProviderSchema,
  model: z.string().max(100).nullable(),
  resultText: z.string().max(100000).nullable(),
  error: z.string().max(1000).nullable(),
  usageId: IdSchema.nullable(),
  startedAt: InstantSchema.nullable(),
  finishedAt: InstantSchema.nullable(),
  ...auditFields,
  ...versionFields,
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const AiUsageSchema = z.object({
  id: IdSchema,
  analysisId: IdSchema.nullable(),
  monthKey: MonthKeySchema,
  provider: AiProviderSchema,
  model: z.string().max(100),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  estimatedCostKrw: MoneySchema,
  /** provider usage 응답 × 단가. 알 수 없으면 null(추정치로 계산). */
  actualCostKrw: MoneySchema.nullable(),
  occurredAt: InstantSchema,
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

export const AiBudgetStatusSchema = z.object({
  monthKey: MonthKeySchema,
  budgetKrw: MoneySchema,
  usedKrw: MoneySchema,
  reservedKrw: MoneySchema,
  remainingKrw: MoneySchema,
  configured: z.boolean(),
});
export type AiBudgetStatus = z.infer<typeof AiBudgetStatusSchema>;

// ---------------------------------------------------------------- Guidance source
export const GUIDANCE_ALLOWED_HOSTS = ["www.moel.go.kr", "www.nts.go.kr", "www.easylaw.go.kr"] as const;
export const GuidanceTopicSchema = z.enum(["labor", "tax", "life", "other"]);
export const EligibilitySchema = z.enum(["unknown", "applicable", "not_applicable"]);
export const GuidanceSourceSchema = z.object({
  id: IdSchema,
  topic: GuidanceTopicSchema,
  title: z.string().min(1).max(300),
  sourceUrl: z.url().refine(
    (u) => {
      try {
        return (GUIDANCE_ALLOWED_HOSTS as readonly string[]).includes(new URL(u).hostname);
      } catch {
        return false;
      }
    },
    { error: "허용된 공공·공식 출처만 사용할 수 있습니다" },
  ),
  checkedAt: DateOnlySchema,
  effectiveDate: DateOnlySchema.nullable(),
  summary: z.string().max(4000),
  /** 소유자 프로필이 없으면 항상 'unknown'. v1은 프로필을 두지 않으므로 항상 'unknown'. */
  eligibility: EligibilitySchema,
  ...auditFields,
  ...versionFields,
});
export type GuidanceSource = z.infer<typeof GuidanceSourceSchema>;

// ---------------------------------------------------------------- API token (iPhone capture)
export const ApiTokenScopeSchema = z.enum(["capture"]);
export const ApiTokenSchema = z.object({
  id: IdSchema,
  label: z.string().min(1).max(100),
  scope: ApiTokenScopeSchema,
  /** 식별용 앞 8자. 비밀 전체는 생성 응답에서 한 번만 반환된다. */
  prefix: z.string().length(8),
  createdAt: InstantSchema,
  lastUsedAt: InstantSchema.nullable(),
  revokedAt: InstantSchema.nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

// ============================================================================
// 4. 읽기 모델
// ============================================================================

export const GoalProgressStatusSchema = z.enum(["active", "achieved", "overdue"]);
export const DataCompletenessSchema = z.enum(["complete", "incomplete"]);

export const AccountBalanceRowSchema = z.object({
  accountId: IdSchema,
  latestSnapshotId: IdSchema.nullable(),
  asOf: DateOnlySchema.nullable(),
  amountKrw: MoneySchema.nullable(),
  estimated: z.boolean(),
  /** 최신 snapshot이 없다. 합계에는 0으로 들어간다. */
  missing: z.boolean(),
  /** asOf가 today − staleAfterDays 보다 이전. */
  stale: z.boolean(),
});
export type AccountBalanceRow = z.infer<typeof AccountBalanceRowSchema>;

/**
 * 순자산 요약(core 순수 함수의 출력).
 *  netWorthKrw = includedAssetsKrw − liabilitiesKrw
 *  liquidAssetsKrw = Σ included & liquid 자산(부채 미차감)
 *  goalGapKrw = goalAmountKrw − netWorthKrw
 *  remainingMonths: today > goalTargetDate → 0(overdue); 아니면 max(1, 달력월 차이)
 *  monthlyRequiredKrw = ceil(goalGapKrw / remainingMonths) (정수 KRW, ROUND_CEIL); achieved/overdue면 null
 */
export const NetWorthSummarySchema = z.object({
  today: DateOnlySchema,
  netWorthKrw: MoneySchema,
  includedAssetsKrw: MoneySchema,
  liabilitiesKrw: MoneySchema,
  liquidAssetsKrw: MoneySchema,
  accounts: z.array(AccountBalanceRowSchema),
  missingAccountIds: z.array(IdSchema),
  staleAccountIds: z.array(IdSchema),
  estimatedAccountIds: z.array(IdSchema),
  earliestAsOf: DateOnlySchema.nullable(),
  latestAsOf: DateOnlySchema.nullable(),
  data: DataCompletenessSchema,
  goal: z.object({
    amountKrw: MoneySchema,
    startDate: DateOnlySchema,
    targetDate: DateOnlySchema,
    gapKrw: MoneySchema,
    remainingMonths: z.number().int().min(0),
    monthlyRequiredKrw: MoneySchema.nullable(),
    status: GoalProgressStatusSchema,
  }),
});
export type NetWorthSummary = z.infer<typeof NetWorthSummarySchema>;

export const TodayRoutineRowSchema = z.object({
  routineId: IdSchema,
  state: RoutineDayStateSchema,
  checkInId: IdSchema.nullable(),
});
export const TodayViewSchema = z.object({
  date: DateOnlySchema,
  /** topDate === today, status open, topRank 오름차순. */
  topTaskIds: z.array(IdSchema).max(TOP_TASKS_PER_DAY),
  /** 오늘 plannedAt인 작업 + 오늘의 CalendarEvent. */
  plannedTaskIds: z.array(IdSchema),
  calendarEventIds: z.array(IdSchema),
  routines: z.array(TodayRoutineRowSchema),
  /** 과거 topDate가 남은 open 작업(자동 이월하지 않음, UI가 이동 제안). */
  staleTopTaskIds: z.array(IdSchema),
});
export type TodayView = z.infer<typeof TodayViewSchema>;

export const WorkspaceWindowSchema = z.object({
  /** checkIns/calendarEvents/receipts 포함 범위(포함 경계). */
  from: DateOnlySchema,
  to: DateOnlySchema,
});

export const WorkspaceDataSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  generatedAt: InstantSchema,
  today: DateOnlySchema,
  timezone: z.literal(TIMEZONE),
  window: WorkspaceWindowSchema,
  settings: SettingsSchema,
  todayView: TodayViewSchema,
  goals: z.array(GoalSchema),
  projects: z.array(ProjectSchema),
  /** 삭제되지 않은 open 작업 전부 + window 내 완료/취소 작업. */
  tasks: z.array(TaskSchema),
  routines: z.array(RoutineSchema),
  checkIns: z.array(CheckInSchema),
  accounts: z.array(AccountSchema),
  /** 계정별 최신 snapshot + window 내 snapshot. */
  snapshots: z.array(BalanceSnapshotSchema),
  netWorth: NetWorthSummarySchema,
  notes: z.array(NoteSummarySchema),
  collections: z.array(CollectionSchema),
  collectionRecords: z.array(CollectionRecordSchema),
  calendarEvents: z.array(CalendarEventSchema),
  proposals: z.array(ProposalSchema),
  inbox: z.array(InboxItemSchema),
  receipts: z.array(ReceiptSchema),
  reviews: z.array(ReviewSchema),
  analyses: z.array(AnalysisSchema),
  aiBudget: AiBudgetStatusSchema,
  connections: z.array(ConnectionSchema),
  guidance: z.array(GuidanceSourceSchema),
  apiTokens: z.array(ApiTokenSchema),
  ops: z.object({
    lastBackupAt: InstantSchema.nullable(),
    lastBackupOk: z.boolean().nullable(),
    workerAlive: z.boolean(),
  }),
});
export type WorkspaceData = z.infer<typeof WorkspaceDataSchema>;

export const ExportManifestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  exportedAt: InstantSchema,
  files: z.array(
    z.object({
      path: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      size: z.number().int().min(0),
    }),
  ),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export const HealthSchema = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  worker: z.boolean(),
  contractVersion: z.literal(CONTRACT_VERSION),
  lastBackupAt: InstantSchema.nullable(),
});
export type Health = z.infer<typeof HealthSchema>;

// ============================================================================
// 5. 명령 (Command)
// ============================================================================

const expected = { expectedVersion: VersionSchema };
const optionalId = { id: IdSchema.optional() };

// ---- task
export const TaskCreatePayloadSchema = z.object({
  ...optionalId,
  title: ShortTextSchema,
  description: LongTextSchema.default(""),
  projectId: IdSchema.nullable().default(null),
  goalId: IdSchema.nullable().default(null),
  dueDate: DateOnlySchema.nullable().default(null),
  plannedAt: InstantSchema.nullable().default(null),
  plannedDurationMin: z.number().int().min(5).max(1440).nullable().default(null),
  recurrence: RecurrenceSchema.nullable().default(null),
});
export const TaskPatchSchema = z.object({
  title: ShortTextSchema.optional(),
  description: LongTextSchema.optional(),
  projectId: IdSchema.nullable().optional(),
  goalId: IdSchema.nullable().optional(),
  dueDate: DateOnlySchema.nullable().optional(),
  plannedAt: InstantSchema.nullable().optional(),
  plannedDurationMin: z.number().int().min(5).max(1440).nullable().optional(),
  recurrence: RecurrenceSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const TaskUpdatePayloadSchema = z.object({ taskId: IdSchema, ...expected, patch: TaskPatchSchema });
export const TaskCompletePayloadSchema = z.object({
  taskId: IdSchema,
  ...expected,
  /** 생략 시 서버 now. */
  completedAt: InstantSchema.optional(),
});
export const TaskRefPayloadSchema = z.object({ taskId: IdSchema, ...expected });
export const TaskSetTopPayloadSchema = z.object({
  taskId: IdSchema,
  ...expected,
  date: DateOnlySchema,
  /** 생략 시 가장 낮은 빈 rank. 3개가 차 있으면 TOP_LIMIT_EXCEEDED. */
  rank: TopRankSchema.optional(),
});

// ---- goal / project
export const GoalCreatePayloadSchema = z.object({
  ...optionalId,
  title: ShortTextSchema,
  description: LongTextSchema.default(""),
  targetDate: DateOnlySchema.nullable().default(null),
});
export const GoalPatchSchema = z.object({
  title: ShortTextSchema.optional(),
  description: LongTextSchema.optional(),
  status: GoalStatusSchema.optional(),
  targetDate: DateOnlySchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const GoalUpdatePayloadSchema = z.object({ goalId: IdSchema, ...expected, patch: GoalPatchSchema });
export const GoalRefPayloadSchema = z.object({ goalId: IdSchema, ...expected });

export const ProjectCreatePayloadSchema = z.object({
  ...optionalId,
  goalId: IdSchema.nullable().default(null),
  title: ShortTextSchema,
  doneCriteria: LongTextSchema.default(""),
  dueDate: DateOnlySchema.nullable().default(null),
});
export const ProjectPatchSchema = z.object({
  goalId: IdSchema.nullable().optional(),
  title: ShortTextSchema.optional(),
  doneCriteria: LongTextSchema.optional(),
  status: ProjectStatusSchema.optional(),
  dueDate: DateOnlySchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const ProjectUpdatePayloadSchema = z.object({
  projectId: IdSchema,
  ...expected,
  patch: ProjectPatchSchema,
});
export const ProjectRefPayloadSchema = z.object({ projectId: IdSchema, ...expected });

// ---- routine / check-in
export const RoutineCreatePayloadSchema = z.object({
  ...optionalId,
  title: ShortTextSchema,
  description: LongTextSchema.default(""),
  schedule: RecurrenceSchema,
});
export const RoutinePatchSchema = z.object({
  title: ShortTextSchema.optional(),
  description: LongTextSchema.optional(),
  schedule: RecurrenceSchema.optional(),
  status: RoutineStatusSchema.optional(),
  sortOrder: z.number().int().optional(),
});
export const RoutineUpdatePayloadSchema = z.object({
  routineId: IdSchema,
  ...expected,
  patch: RoutinePatchSchema,
});
export const RoutineRefPayloadSchema = z.object({ routineId: IdSchema, ...expected });

/** upsert(routineId, date). 같은 값 재전송은 no-op. */
export const CheckInRecordPayloadSchema = z.object({
  routineId: IdSchema,
  date: DateOnlySchema,
  status: CheckInStatusSchema,
  note: z.string().max(500).nullable().default(null),
});
export const CheckInClearPayloadSchema = z.object({ routineId: IdSchema, date: DateOnlySchema });

// ---- account / snapshot
export const AccountCreatePayloadSchema = z
  .object({
    ...optionalId,
    name: ShortTextSchema,
    kind: AccountKindSchema,
    category: AccountCategorySchema,
    institution: z.string().max(100).nullable().default(null),
    currency: CurrencySchema.default(BASE_CURRENCY),
    included: z.boolean().default(true),
    liquid: z.boolean().default(false),
    memo: z.string().max(1000).nullable().default(null),
  })
  .refine((a) => a.kind !== "liability" || (a.included && !a.liquid), {
    error: "부채는 included=false/liquid=true를 허용하지 않습니다 (LIABILITY_ALWAYS_INCLUDED)",
  })
  .refine((a) => (a.kind === "asset") === isAssetCategory(a.category), {
    error: "category가 kind와 맞지 않습니다",
  });
export const AccountPatchSchema = z.object({
  name: ShortTextSchema.optional(),
  category: AccountCategorySchema.optional(),
  institution: z.string().max(100).nullable().optional(),
  included: z.boolean().optional(),
  liquid: z.boolean().optional(),
  memo: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const AccountUpdatePayloadSchema = z.object({
  accountId: IdSchema,
  ...expected,
  patch: AccountPatchSchema,
});
export const AccountArchivePayloadSchema = z.object({
  accountId: IdSchema,
  ...expected,
  reason: z.string().min(1).max(500),
});
export const AccountRefPayloadSchema = z.object({ accountId: IdSchema, ...expected });

export const SnapshotAddPayloadSchema = z
  .object({
    ...optionalId,
    accountId: IdSchema,
    asOf: DateOnlySchema,
    amount: MoneySchema,
    fxRate: MoneySchema.nullable().default(null),
    estimated: z.boolean().default(false),
    reason: z.string().max(500).nullable().default(null),
    /** 같은 (accountId, asOf)가 있으면 기본 SNAPSHOT_EXISTS; true면 교체. */
    replace: z.boolean().default(false),
  })
  .refine((s) => !s.estimated || (s.reason ?? "").trim().length > 0, {
    error: "estimated=true 이면 reason이 필요합니다 (ESTIMATE_REASON_REQUIRED)",
  });
export const SnapshotDeletePayloadSchema = z.object({ snapshotId: IdSchema });

// ---- note
export const NoteCreatePayloadSchema = z.object({
  ...optionalId,
  title: z.string().max(300).default(""),
  document: NoteDocumentSchema.optional(),
  tags: z.array(TagSchema).max(20).default([]),
  projectId: IdSchema.nullable().default(null),
  goalId: IdSchema.nullable().default(null),
});
/** 전체 저장. 서버는 text/links를 파생하고 이전 버전을 NoteRevision으로 보존한다. */
export const NoteSavePayloadSchema = z.object({
  noteId: IdSchema,
  ...expected,
  title: z.string().max(300),
  document: NoteDocumentSchema,
  tags: z.array(TagSchema).max(20),
  projectId: IdSchema.nullable(),
  goalId: IdSchema.nullable(),
});
export const NoteRefPayloadSchema = z.object({ noteId: IdSchema, ...expected });
export const NoteRestoreRevisionPayloadSchema = z.object({
  noteId: IdSchema,
  ...expected,
  revisionId: IdSchema,
});

// ---- collection
export const CollectionCreatePayloadSchema = z.object({
  ...optionalId,
  name: z.string().min(1).max(100),
  icon: z.string().max(16).nullable().default(null),
  properties: z.array(CollectionPropertySchema).max(50),
  views: z.array(CollectionViewSchema).min(1).max(20),
});
export const CollectionPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(16).nullable().optional(),
  /** 전체 교체. 삭제된 속성의 record 값은 서버가 제거한다. */
  properties: z.array(CollectionPropertySchema).max(50).optional(),
  views: z.array(CollectionViewSchema).min(1).max(20).optional(),
});
export const CollectionUpdatePayloadSchema = z.object({
  collectionId: IdSchema,
  ...expected,
  patch: CollectionPatchSchema,
});
export const CollectionRefPayloadSchema = z.object({ collectionId: IdSchema, ...expected });
export const CollectionRecordCreatePayloadSchema = z.object({
  ...optionalId,
  collectionId: IdSchema,
  values: z.record(PropertyIdSchema, PropertyValueSchema),
});
/** values는 전체 교체. */
export const CollectionRecordUpdatePayloadSchema = z.object({
  recordId: IdSchema,
  ...expected,
  values: z.record(PropertyIdSchema, PropertyValueSchema),
  sortOrder: z.number().int().optional(),
});
export const CollectionRecordRefPayloadSchema = z.object({ recordId: IdSchema, ...expected });

// ---- calendar (local events + proposals)
export const CalendarEventCreatePayloadSchema = z.object({
  ...optionalId,
  title: z.string().min(1).max(300),
  description: LongTextSchema.default(""),
  location: z.string().max(300).nullable().default(null),
  when: EventWhenSchema,
  taskId: IdSchema.nullable().default(null),
});
export const CalendarEventPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: LongTextSchema.optional(),
  location: z.string().max(300).nullable().optional(),
  when: EventWhenSchema.optional(),
  taskId: IdSchema.nullable().optional(),
});
/** source='local'만 직접 수정 가능. google 이벤트는 USE_PROPOSAL. */
export const CalendarEventUpdatePayloadSchema = z.object({
  eventId: IdSchema,
  ...expected,
  patch: CalendarEventPatchSchema,
});
export const CalendarEventRefPayloadSchema = z.object({ eventId: IdSchema, ...expected });

export const CalendarProposePayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("calendar.create"),
    ...optionalId,
    draft: CalendarEventDraftSchema,
    taskId: IdSchema.nullable().default(null),
    /** 생략 시 Connection.meta.managedCalendarId. */
    targetCalendarId: z.string().max(200).nullable().default(null),
  }),
  z.object({
    kind: z.literal("calendar.update"),
    ...optionalId,
    calendarEventId: IdSchema,
    expectedEventVersion: VersionSchema,
    draft: CalendarEventDraftSchema,
  }),
  z.object({
    kind: z.literal("calendar.delete"),
    ...optionalId,
    calendarEventId: IdSchema,
    expectedEventVersion: VersionSchema,
  }),
]);
export const ProposalApprovePayloadSchema = z.object({ proposalId: IdSchema, ...expected });
export const ProposalRejectPayloadSchema = z.object({
  proposalId: IdSchema,
  ...expected,
  reason: z.string().max(500).nullable().default(null),
});

// ---- inbox / receipt
export const InboxCreatePayloadSchema = z
  .object({
    ...optionalId,
    kind: z.enum(["text", "url"]),
    text: z.string().max(20000).nullable().default(null),
    url: z.url().nullable().default(null),
  })
  .refine((i) => (i.kind === "text" ? (i.text ?? "").trim().length > 0 : i.url !== null), {
    error: "text 항목은 text, url 항목은 url이 필요합니다",
  });
export const InboxConvertTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task"),
    title: ShortTextSchema.optional(),
    dueDate: DateOnlySchema.nullable().default(null),
    projectId: IdSchema.nullable().default(null),
  }),
  z.object({ type: z.literal("note"), title: z.string().max(300).optional() }),
  /** image/receipt 항목만. Receipt draft를 만들고 OCR(가능 시)을 큐잉한다. */
  z.object({ type: z.literal("receipt") }),
]);
export const InboxConvertPayloadSchema = z.object({ itemId: IdSchema, target: InboxConvertTargetSchema });
export const InboxArchivePayloadSchema = z.object({ itemId: IdSchema });

export const ReceiptFieldsPatchSchema = z.object({
  merchant: z.string().max(200).nullable().optional(),
  amount: MoneySchema.nullable().optional(),
  currency: CurrencySchema.nullable().optional(),
  date: DateOnlySchema.nullable().optional(),
});
export const ReceiptUpdatePayloadSchema = z.object({
  receiptId: IdSchema,
  ...expected,
  /** 소유자 입력값. source='owner'로 기록. */
  fields: ReceiptFieldsPatchSchema,
});
export const ReceiptConfirmPayloadSchema = z.object({
  receiptId: IdSchema,
  ...expected,
  confirmed: ReceiptConfirmedSchema,
});
export const ReceiptRefPayloadSchema = z.object({ receiptId: IdSchema, ...expected });
export const ReceiptRequestOcrPayloadSchema = z.object({ receiptId: IdSchema });

// ---- review
export const ReviewGeneratePayloadSchema = z.object({
  kind: ReviewKindSchema,
  /** 기간 안의 아무 날짜. 서버가 periodStart/End와 key를 정한다. */
  date: DateOnlySchema,
});
export const ReviewUpdatePayloadSchema = z.object({
  reviewId: IdSchema,
  ...expected,
  owner: ReviewOwnerTextSchema.partial(),
});
export const ReviewRefPayloadSchema = z.object({ reviewId: IdSchema, ...expected });

// ---- analysis (AI)
export const AnalysisPreviewPayloadSchema = z.object({
  ...optionalId,
  purpose: z.string().min(1).max(500),
  noteIds: z.array(IdSchema).min(1).max(50),
});
export const AnalysisExecutePayloadSchema = z.object({
  analysisId: IdSchema,
  ...expected,
  consent: z.literal(true),
  /** preview에서 본 예상 비용. 현재 estimate와 다르면 AI_CONSENT_STALE. */
  consentEstimateKrw: MoneySchema,
});
export const AnalysisRefPayloadSchema = z.object({ analysisId: IdSchema, ...expected });

// ---- settings / connection / token / backup / guidance
export const SettingsPatchSchema = z.object({
  finance: FinanceSettingsSchema.partial().optional(),
  ai: AiSettingsSchema.partial().optional(),
  backup: BackupSettingsSchema.partial().optional(),
  capture: CaptureSettingsSchema.partial().optional(),
});
export const SettingsUpdatePayloadSchema = z.object({ ...expected, patch: SettingsPatchSchema });

export const ConnectionDisconnectPayloadSchema = z.object({ provider: ConnectionProviderSchema });
export const ConnectionSyncNowPayloadSchema = z.object({
  provider: z.enum(["google", "toss_bank", "toss_securities"]),
});

export const TokenCreatePayloadSchema = z.object({
  label: z.string().min(1).max(100),
  scope: ApiTokenScopeSchema,
});
export const TokenRevokePayloadSchema = z.object({ tokenId: IdSchema });

export const BackupRunNowPayloadSchema = z.object({});

export const GuidanceUpsertPayloadSchema = z.object({
  ...optionalId,
  expectedVersion: VersionSchema.optional(),
  topic: GuidanceTopicSchema,
  title: z.string().min(1).max(300),
  sourceUrl: GuidanceSourceSchema.shape.sourceUrl,
  checkedAt: DateOnlySchema,
  effectiveDate: DateOnlySchema.nullable().default(null),
  summary: z.string().max(4000).default(""),
});
export const GuidanceDeletePayloadSchema = z.object({ guidanceId: IdSchema, ...expected });

// ---- envelope
function cmd<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    type: z.literal(type),
    payload,
    idempotencyKey: IdempotencyKeySchema.optional(),
  });
}

export const CommandSchema = z.discriminatedUnion("type", [
  cmd("task.create", TaskCreatePayloadSchema),
  cmd("task.update", TaskUpdatePayloadSchema),
  cmd("task.complete", TaskCompletePayloadSchema),
  cmd("task.reopen", TaskRefPayloadSchema),
  cmd("task.cancel", TaskRefPayloadSchema),
  cmd("task.delete", TaskRefPayloadSchema),
  cmd("task.setTop", TaskSetTopPayloadSchema),
  cmd("task.clearTop", TaskRefPayloadSchema),

  cmd("goal.create", GoalCreatePayloadSchema),
  cmd("goal.update", GoalUpdatePayloadSchema),
  cmd("goal.delete", GoalRefPayloadSchema),

  cmd("project.create", ProjectCreatePayloadSchema),
  cmd("project.update", ProjectUpdatePayloadSchema),
  cmd("project.delete", ProjectRefPayloadSchema),

  cmd("routine.create", RoutineCreatePayloadSchema),
  cmd("routine.update", RoutineUpdatePayloadSchema),
  cmd("routine.delete", RoutineRefPayloadSchema),
  cmd("checkin.record", CheckInRecordPayloadSchema),
  cmd("checkin.clear", CheckInClearPayloadSchema),

  cmd("account.create", AccountCreatePayloadSchema),
  cmd("account.update", AccountUpdatePayloadSchema),
  cmd("account.archive", AccountArchivePayloadSchema),
  cmd("account.restore", AccountRefPayloadSchema),
  cmd("snapshot.add", SnapshotAddPayloadSchema),
  cmd("snapshot.delete", SnapshotDeletePayloadSchema),

  cmd("note.create", NoteCreatePayloadSchema),
  cmd("note.save", NoteSavePayloadSchema),
  cmd("note.delete", NoteRefPayloadSchema),
  cmd("note.restoreRevision", NoteRestoreRevisionPayloadSchema),

  cmd("collection.create", CollectionCreatePayloadSchema),
  cmd("collection.update", CollectionUpdatePayloadSchema),
  cmd("collection.delete", CollectionRefPayloadSchema),
  cmd("collection.record.create", CollectionRecordCreatePayloadSchema),
  cmd("collection.record.update", CollectionRecordUpdatePayloadSchema),
  cmd("collection.record.delete", CollectionRecordRefPayloadSchema),

  cmd("calendar.event.create", CalendarEventCreatePayloadSchema),
  cmd("calendar.event.update", CalendarEventUpdatePayloadSchema),
  cmd("calendar.event.delete", CalendarEventRefPayloadSchema),
  cmd("calendar.propose", CalendarProposePayloadSchema),
  cmd("calendar.approve", ProposalApprovePayloadSchema),
  cmd("calendar.reject", ProposalRejectPayloadSchema),

  cmd("inbox.create", InboxCreatePayloadSchema),
  cmd("inbox.convert", InboxConvertPayloadSchema),
  cmd("inbox.archive", InboxArchivePayloadSchema),
  cmd("receipt.update", ReceiptUpdatePayloadSchema),
  cmd("receipt.confirm", ReceiptConfirmPayloadSchema),
  cmd("receipt.discard", ReceiptRefPayloadSchema),
  cmd("receipt.requestOcr", ReceiptRequestOcrPayloadSchema),

  cmd("review.generate", ReviewGeneratePayloadSchema),
  cmd("review.update", ReviewUpdatePayloadSchema),
  cmd("review.finalize", ReviewRefPayloadSchema),

  cmd("analysis.preview", AnalysisPreviewPayloadSchema),
  cmd("analysis.execute", AnalysisExecutePayloadSchema),
  cmd("analysis.cancel", AnalysisRefPayloadSchema),

  cmd("settings.update", SettingsUpdatePayloadSchema),
  cmd("connection.disconnect", ConnectionDisconnectPayloadSchema),
  cmd("connection.syncNow", ConnectionSyncNowPayloadSchema),
  cmd("token.create", TokenCreatePayloadSchema),
  cmd("token.revoke", TokenRevokePayloadSchema),
  cmd("backup.runNow", BackupRunNowPayloadSchema),
  cmd("guidance.upsert", GuidanceUpsertPayloadSchema),
  cmd("guidance.delete", GuidanceDeletePayloadSchema),
]);

/** 유효성 검사 후(파싱된) 명령. */
export type Command = z.infer<typeof CommandSchema>;
/** 전송 전(입력) 명령: default가 있는 필드는 생략 가능. */
export type CommandInput = z.input<typeof CommandSchema>;
export type CommandType = Command["type"];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
export type CommandPayload<T extends CommandType> = CommandOf<T>["payload"];

/** 유일한 기준 목록(04_api). CommandSchema와 일치하지 않으면 컴파일 오류. */
export const COMMAND_TYPES = [
  "task.create",
  "task.update",
  "task.complete",
  "task.reopen",
  "task.cancel",
  "task.delete",
  "task.setTop",
  "task.clearTop",
  "goal.create",
  "goal.update",
  "goal.delete",
  "project.create",
  "project.update",
  "project.delete",
  "routine.create",
  "routine.update",
  "routine.delete",
  "checkin.record",
  "checkin.clear",
  "account.create",
  "account.update",
  "account.archive",
  "account.restore",
  "snapshot.add",
  "snapshot.delete",
  "note.create",
  "note.save",
  "note.delete",
  "note.restoreRevision",
  "collection.create",
  "collection.update",
  "collection.delete",
  "collection.record.create",
  "collection.record.update",
  "collection.record.delete",
  "calendar.event.create",
  "calendar.event.update",
  "calendar.event.delete",
  "calendar.propose",
  "calendar.approve",
  "calendar.reject",
  "inbox.create",
  "inbox.convert",
  "inbox.archive",
  "receipt.update",
  "receipt.confirm",
  "receipt.discard",
  "receipt.requestOcr",
  "review.generate",
  "review.update",
  "review.finalize",
  "analysis.preview",
  "analysis.execute",
  "analysis.cancel",
  "settings.update",
  "connection.disconnect",
  "connection.syncNow",
  "token.create",
  "token.revoke",
  "backup.runNow",
  "guidance.upsert",
  "guidance.delete",
] as const;

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _assertCommandTypesExhaustive: Equals<CommandType, (typeof COMMAND_TYPES)[number]> = true;
void _assertCommandTypesExhaustive;

/** AI가 실행할 수 없는 명령(15_ai: AI는 금융·캘린더 쓰기를 하지 않는다). 서버가 actor='ai'면 FORBIDDEN. */
export const AI_FORBIDDEN_COMMAND_PREFIXES = [
  "account.",
  "snapshot.",
  "calendar.",
  "receipt.confirm",
  "settings.",
] as const;

// ============================================================================
// 6. 명령 결과 / API 응답 / 오류
// ============================================================================

export interface CommandResultMap {
  "task.create": { task: Task };
  "task.update": { task: Task };
  /** 반복 작업이면 다음 발생 Task를 함께 반환. */
  "task.complete": { task: Task; nextOccurrence: Task | null };
  "task.reopen": { task: Task };
  "task.cancel": { task: Task };
  "task.delete": { task: Task };
  "task.setTop": { task: Task };
  "task.clearTop": { task: Task };
  "goal.create": { goal: Goal };
  "goal.update": { goal: Goal };
  "goal.delete": { goal: Goal };
  "project.create": { project: Project };
  "project.update": { project: Project };
  "project.delete": { project: Project };
  "routine.create": { routine: Routine };
  "routine.update": { routine: Routine };
  "routine.delete": { routine: Routine };
  "checkin.record": { checkIn: CheckIn };
  "checkin.clear": { routineId: Id; date: DateOnly; removed: boolean };
  "account.create": { account: Account };
  "account.update": { account: Account };
  "account.archive": { account: Account };
  "account.restore": { account: Account };
  "snapshot.add": { snapshot: BalanceSnapshot; netWorth: NetWorthSummary };
  "snapshot.delete": { snapshotId: Id; netWorth: NetWorthSummary };
  "note.create": { note: Note };
  "note.save": { note: Note; revision: NoteRevisionSummary };
  "note.delete": { note: NoteSummary };
  "note.restoreRevision": { note: Note; revision: NoteRevisionSummary };
  "collection.create": { collection: Collection };
  "collection.update": { collection: Collection };
  "collection.delete": { collection: Collection };
  "collection.record.create": { record: CollectionRecord };
  "collection.record.update": { record: CollectionRecord };
  "collection.record.delete": { record: CollectionRecord };
  "calendar.event.create": { event: CalendarEvent };
  "calendar.event.update": { event: CalendarEvent };
  "calendar.event.delete": { event: CalendarEvent };
  "calendar.propose": { proposal: Proposal };
  /** approved 상태로 전이하고 job을 큐잉한다. applied는 worker가 비동기로 기록한다. */
  "calendar.approve": { proposal: Proposal; jobQueued: boolean };
  "calendar.reject": { proposal: Proposal };
  "inbox.create": { item: InboxItem };
  "inbox.convert": {
    item: InboxItem;
    created:
      { type: "task"; task: Task } | { type: "note"; note: Note } | { type: "receipt"; receipt: Receipt };
  };
  "inbox.archive": { item: InboxItem };
  "receipt.update": { receipt: Receipt };
  "receipt.confirm": { receipt: Receipt };
  "receipt.discard": { receipt: Receipt };
  "receipt.requestOcr": { receipt: Receipt; jobQueued: boolean };
  "review.generate": { review: Review; regenerated: boolean };
  "review.update": { review: Review };
  "review.finalize": { review: Review };
  "analysis.preview": { analysis: Analysis; budget: AiBudgetStatus };
  "analysis.execute": { analysis: Analysis; jobQueued: boolean };
  "analysis.cancel": { analysis: Analysis };
  "settings.update": { settings: Settings };
  "connection.disconnect": { connection: Connection };
  "connection.syncNow": { connection: Connection; jobQueued: boolean };
  /** secret은 이 응답에서 단 한 번만 반환된다. */
  "token.create": { token: ApiToken; secret: string };
  "token.revoke": { token: ApiToken };
  "backup.runNow": { jobQueued: boolean };
  "guidance.upsert": { guidance: GuidanceSource };
  "guidance.delete": { guidance: GuidanceSource };
}
const _assertResultsExhaustive: Equals<keyof CommandResultMap, CommandType> = true;
void _assertResultsExhaustive;

export type CommandResult<T extends CommandType> = CommandResultMap[T];

export interface CommandOk<T extends CommandType = CommandType> {
  ok: true;
  commandId: Id;
  type: T;
  result: CommandResult<T>;
  /** idempotencyKey 재전송으로 이전 응답을 재생했으면 true. */
  replayed: boolean;
  completedAt: Instant;
}

export const ERROR_CODES = [
  "UNAUTHORIZED", // 401
  "FORBIDDEN", // 403 (AI actor 금지 명령, 토큰 scope 밖 등)
  "NOT_FOUND", // 404
  "VALIDATION_FAILED", // 422 payload schema
  "IDEMPOTENCY_MISMATCH", // 422 같은 키, 다른 payload
  "VERSION_CONFLICT", // 409
  "STATE_TRANSITION_INVALID", // 409 (inbox archived→convert 등)
  "TOP_LIMIT_EXCEEDED", // 409 하루 top 3 초과
  "TOP_RANK_TAKEN", // 409
  "SNAPSHOT_EXISTS", // 409 (accountId, asOf) 중복, replace=false
  "LIABILITY_ALWAYS_INCLUDED", // 422
  "ESTIMATE_REASON_REQUIRED", // 422
  "FX_RATE_REQUIRED", // 422
  "RECURRENCE_REQUIRES_DUE_DATE", // 422
  "ACCOUNT_ARCHIVED", // 409 archived 계정에 snapshot 추가
  "USE_PROPOSAL", // 409 google 이벤트 직접 수정 시도
  "NOT_MANAGED_EVENT", // 409 managed가 아닌 이벤트에 update/delete proposal
  "INTEGRATION_DISCONNECTED", // 412
  "AI_NOT_CONFIGURED", // 412
  "AI_CONSENT_REQUIRED", // 412
  "AI_CONSENT_STALE", // 409 동의 당시 추정치와 현재 추정치 불일치
  "AI_BUDGET_EXCEEDED", // 409
  "OCR_UNAVAILABLE", // 412
  "ATTACHMENT_REJECTED", // 413/415 크기·MIME·hash 불일치
  "RATE_LIMITED", // 429
  "INTERNAL", // 500
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const HTTP_STATUS_BY_ERROR: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  IDEMPOTENCY_MISMATCH: 422,
  VERSION_CONFLICT: 409,
  STATE_TRANSITION_INVALID: 409,
  TOP_LIMIT_EXCEEDED: 409,
  TOP_RANK_TAKEN: 409,
  SNAPSHOT_EXISTS: 409,
  LIABILITY_ALWAYS_INCLUDED: 422,
  ESTIMATE_REASON_REQUIRED: 422,
  FX_RATE_REQUIRED: 422,
  RECURRENCE_REQUIRES_DUE_DATE: 422,
  ACCOUNT_ARCHIVED: 409,
  USE_PROPOSAL: 409,
  NOT_MANAGED_EVENT: 409,
  INTEGRATION_DISCONNECTED: 412,
  AI_NOT_CONFIGURED: 412,
  AI_CONSENT_REQUIRED: 412,
  AI_CONSENT_STALE: 409,
  AI_BUDGET_EXCEEDED: 409,
  OCR_UNAVAILABLE: 412,
  ATTACHMENT_REJECTED: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const VersionedResourceTypeSchema = z.enum([
  "task",
  "goal",
  "project",
  "routine",
  "account",
  "note",
  "collection",
  "collectionRecord",
  "calendarEvent",
  "proposal",
  "receipt",
  "review",
  "analysis",
  "settings",
  "connection",
  "guidance",
]);
export type VersionedResourceType = z.infer<typeof VersionedResourceTypeSchema>;

export const ValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

/** 409 VERSION_CONFLICT 본문. current는 재적용 힌트(비밀 없음). */
export const VersionConflictDetailsSchema = z.object({
  resourceType: VersionedResourceTypeSchema,
  resourceId: z.string(),
  expectedVersion: VersionSchema,
  currentVersion: VersionSchema,
  current: z.unknown(),
  refetchUrl: z.literal(API_ROUTES.workspace),
});
export type VersionConflictDetails = z.infer<typeof VersionConflictDetailsSchema>;

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    /** 한국어, 비밀·잔액·본문 없음. */
    message: z.string(),
    details: z.unknown().optional(),
    /** 다음 안전한 행동(01_product). 예: '최신 데이터를 불러와 다시 적용하세요'. */
    nextAction: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export interface VersionConflictError extends ApiError {
  error: ApiError["error"] & { code: "VERSION_CONFLICT"; details: VersionConflictDetails };
}
export interface ValidationError extends ApiError {
  error: ApiError["error"] & {
    code: "VALIDATION_FAILED";
    details: { issues: z.infer<typeof ValidationIssueSchema>[] };
  };
}
export interface AiBudgetExceededError extends ApiError {
  error: ApiError["error"] & { code: "AI_BUDGET_EXCEEDED"; details: { estimate: CostEstimate } };
}

export type CommandResponse<T extends CommandType = CommandType> = CommandOk<T> | ApiError;

/** POST /api/v1/commands 요청 본문. */
export type CommandRequest = CommandInput;

/** POST /api/v1/capture (Bearer capture token). multipart: file + fields, 또는 JSON. */
export const CaptureRequestSchema = z
  .object({
    kind: InboxKindSchema,
    text: z.string().max(20000).optional(),
    url: z.url().optional(),
    source: z.enum(["share", "shortcut", "api"]).default("shortcut"),
    /** 파일이 있으면 클라이언트가 계산한 sha256(선택). 서버 계산값과 다르면 ATTACHMENT_REJECTED. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .refine(
    (c) =>
      c.kind === "text" ? typeof c.text === "string" : c.kind === "url" ? typeof c.url === "string" : true,
    {
      error: "text/url 항목은 해당 필드가 필요합니다",
    },
  );
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;
export interface CaptureResponse {
  ok: true;
  item: InboxItem;
  attachment: Attachment | null;
  receipt: Receipt | null;
}

/** POST /api/v1/attachments 응답. */
export interface AttachmentUploadResponse {
  ok: true;
  attachment: Attachment;
}

// ============================================================================
// 7. 도메인 규칙 상수(core가 구현, contracts는 선언만)
// ============================================================================

/** decimal.js 설정과 반올림 정책. core는 이 값을 그대로 사용한다. */
export const DECIMAL_POLICY = {
  precision: 40,
  /** FX 환산·합계: ROUND_HALF_UP → 정수 KRW */
  krwRounding: "ROUND_HALF_UP",
  /** monthlyRequired: ROUND_CEIL → 정수 KRW (부족하게 저축하지 않도록 올림) */
  monthlyRequiredRounding: "ROUND_CEIL",
  /** 통화별 소수 자릿수. 없으면 2. */
  currencyScale: { KRW: 0, JPY: 0, USD: 2, EUR: 2 } as Readonly<Record<string, number>>,
} as const;

/** Inbox 상태 전이 표. 그 밖은 STATE_TRANSITION_INVALID. */
export const INBOX_TRANSITIONS: Readonly<
  Record<z.infer<typeof InboxStatusSchema>, readonly z.infer<typeof InboxStatusSchema>[]>
> = {
  new: ["converted", "archived"],
  converted: [],
  archived: [],
};

/** Proposal 상태 전이 표. */
export const PROPOSAL_TRANSITIONS: Readonly<
  Record<z.infer<typeof ProposalStatusSchema>, readonly z.infer<typeof ProposalStatusSchema>[]>
> = {
  pending: ["approved", "rejected", "expired"],
  approved: ["applied", "failed"],
  applied: [],
  rejected: [],
  failed: ["approved"],
  expired: [],
};

/** Analysis 상태 전이 표. */
export const ANALYSIS_TRANSITIONS: Readonly<
  Record<z.infer<typeof AnalysisStatusSchema>, readonly z.infer<typeof AnalysisStatusSchema>[]>
> = {
  previewed: ["consented", "cancelled"],
  consented: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};
