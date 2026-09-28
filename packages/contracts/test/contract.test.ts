import { describe, expect, it } from "vitest";
import {
  AccountCreatePayloadSchema,
  COMMAND_TYPES,
  CommandSchema,
  DateOnlySchema,
  HTTP_STATUS_BY_ERROR,
  InstantSchema,
  MoneySchema,
  RecurrenceSchema,
  SnapshotAddPayloadSchema,
} from "../index";

describe("TYPE-CONTRACT-001 contract primitives and commands (DR-001, NFR-002)", () => {
  it("accepts only decimal-string money", () => {
    for (const ok of ["0", "1500000", "-12.5", "0.0001"]) expect(MoneySchema.safeParse(ok).success).toBe(true);
    for (const bad of ["1e6", "1,000", "01", "1.23456", "", " 1", 1000]) {
      expect(MoneySchema.safeParse(bad).success).toBe(false);
    }
  });

  it("accepts real calendar dates and Z instants only", () => {
    expect(DateOnlySchema.safeParse("2028-02-29").success).toBe(true);
    expect(DateOnlySchema.safeParse("2026-02-29").success).toBe(false);
    expect(InstantSchema.safeParse("2026-09-28T15:00:00.000Z").success).toBe(true);
    expect(InstantSchema.safeParse("2026-09-29T00:00:00+09:00").success).toBe(false);
  });

  it("lists every command type exactly once", () => {
    const schemaTypes = CommandSchema.options.map((o) => o.shape.type.value).sort();
    expect([...COMMAND_TYPES].sort()).toEqual(schemaTypes);
    expect(new Set(COMMAND_TYPES).size).toBe(COMMAND_TYPES.length);
  });

  it("parses a command with defaults filled in", () => {
    const parsed = CommandSchema.parse({ type: "task.create", payload: { title: "장보기" }, idempotencyKey: "abcdefgh-1" });
    expect(parsed).toMatchObject({ type: "task.create", payload: { title: "장보기", dueDate: null, recurrence: null } });
  });

  it("forces liabilities to count in net worth (review D-13)", () => {
    const base = { name: "대출", kind: "liability", category: "loan" } as const;
    expect(AccountCreatePayloadSchema.safeParse(base).success).toBe(true);
    expect(AccountCreatePayloadSchema.safeParse({ ...base, included: false }).success).toBe(false);
    expect(AccountCreatePayloadSchema.safeParse({ ...base, category: "deposit" }).success).toBe(false);
  });

  it("requires a reason for estimated snapshots", () => {
    const base = { accountId: "11111111-1111-4111-8111-111111111111", asOf: "2026-09-28", amount: "100" };
    expect(SnapshotAddPayloadSchema.safeParse({ ...base, estimated: true }).success).toBe(false);
    expect(SnapshotAddPayloadSchema.safeParse({ ...base, estimated: true, reason: "앱 점검 중" }).success).toBe(true);
  });

  it("validates recurrence shapes", () => {
    expect(RecurrenceSchema.safeParse({ kind: "weekly", weekdays: [], startDate: "2026-09-28", endDate: null }).success).toBe(false);
    expect(RecurrenceSchema.safeParse({ kind: "monthly", day: 31, startDate: "2026-09-28", endDate: null }).success).toBe(true);
    expect(RecurrenceSchema.safeParse({ kind: "daily", startDate: "2026-09-28", endDate: "2026-09-01" }).success).toBe(false);
  });

  it("maps every error code to an HTTP status", () => {
    expect(HTTP_STATUS_BY_ERROR.VERSION_CONFLICT).toBe(409);
    expect(Object.values(HTTP_STATUS_BY_ERROR).every((s) => s >= 400 && s < 600)).toBe(true);
  });
});
