import { sql } from "drizzle-orm";
import type { CollectionProperty, CollectionView } from "@liferoute/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadWorkspace } from "../src/workspace";
import { loadNoteDetail, noteMarkdown } from "../src/notes-read";
import { freshDb, harness, type Harness } from "./helpers";

let h: Harness;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await freshDb();
  close = t.close;
  h = harness(t.db);
});
afterAll(async () => close());

describe("INT-API-001 command pipeline (NFR-002)", () => {
  it("rejects invalid payloads with 422 and field issues", async () => {
    const res = await h.run({ type: "task.create", payload: { title: "" } } as never);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.issues[0].path).toContain("title");
  });

  it("replays an idempotent retry and refuses a different payload under the same key", async () => {
    const first = await h.run({
      type: "task.create",
      payload: { title: "장보기" },
      idempotencyKey: "retry-key-0001",
    });
    const again = await h.run({
      type: "task.create",
      payload: { title: "장보기" },
      idempotencyKey: "retry-key-0001",
    });
    expect(first.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.result.task.id).toBe(first.body.result.task.id);
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.tasks.filter((t) => t.title === "장보기")).toHaveLength(1);
    const mismatch = await h.run({
      type: "task.create",
      payload: { title: "다른 것" },
      idempotencyKey: "retry-key-0001",
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe("IDEMPOTENCY_MISMATCH");
  });

  it("returns 409 with the current resource when the expected version is stale", async () => {
    const { task } = await h.ok({ type: "task.create", payload: { title: "보고서" } });
    await h.ok({
      type: "task.update",
      payload: { taskId: task.id, expectedVersion: 1, patch: { title: "보고서 v2" } },
    });
    const stale = await h.run({
      type: "task.update",
      payload: { taskId: task.id, expectedVersion: 1, patch: { title: "덮어쓰기" } },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details).toMatchObject({
      resourceType: "task",
      resourceId: task.id,
      expectedVersion: 1,
      currentVersion: 2,
      refetchUrl: "/api/v1/workspace",
    });
    expect(stale.body.error.details.current.title).toBe("보고서 v2");
    expect(stale.body.error.nextAction).toBeTruthy();
  });

  it("forbids financial and calendar writes by the AI actor", async () => {
    const res = await h.run(
      { type: "account.create", payload: { name: "x", kind: "asset", category: "cash" } },
      "ai",
    );
    expect(res.status).toBe(403);
  });
});

describe("INT-CMD-PLAN-001 plans, Top 3 and routines (FR-001..FR-004)", () => {
  it("enforces three top tasks per day with unique ranks", async () => {
    const ids: string[] = [];
    for (const title of ["a", "b", "c", "d"])
      ids.push((await h.ok({ type: "task.create", payload: { title } })).task.id);
    for (const id of ids.slice(0, 3))
      await h.ok({ type: "task.setTop", payload: { taskId: id, expectedVersion: 1, date: "2026-09-28" } });
    const fourth = await h.run({
      type: "task.setTop",
      payload: { taskId: ids[3]!, expectedVersion: 1, date: "2026-09-28" },
    });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("TOP_LIMIT_EXCEEDED");
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.todayView.topTaskIds).toEqual(ids.slice(0, 3));
    // Completing one frees its slot.
    await h.ok({ type: "task.complete", payload: { taskId: ids[0]!, expectedVersion: 2 } });
    await h.ok({ type: "task.setTop", payload: { taskId: ids[3]!, expectedVersion: 1, date: "2026-09-28" } });
  });

  it("rolls a recurring task forward on completion without duplicates on reopen", async () => {
    const res = await h.run({
      type: "task.create",
      payload: {
        title: "주간 정리",
        recurrence: { kind: "weekly", weekdays: ["mon"], startDate: "2026-09-01", endDate: null },
      },
    });
    expect(res.body.error.code).toBe("RECURRENCE_REQUIRES_DUE_DATE");
    const { task } = await h.ok({
      type: "task.create",
      payload: {
        title: "주간 정리",
        dueDate: "2026-09-14",
        recurrence: { kind: "weekly", weekdays: ["mon"], startDate: "2026-09-01", endDate: null },
      },
    });
    const done = await h.ok({ type: "task.complete", payload: { taskId: task.id, expectedVersion: 1 } });
    expect(done.nextOccurrence.dueDate).toBe("2026-10-05"); // first Monday after max(09-14, today 09-28)
    expect(done.nextOccurrence.seriesId).toBe(task.id);
    const reopened = await h.ok({ type: "task.reopen", payload: { taskId: task.id, expectedVersion: 2 } });
    const again = await h.ok({
      type: "task.complete",
      payload: { taskId: task.id, expectedVersion: reopened.task.version },
    });
    expect(again.nextOccurrence).toBeNull();
  });

  it("keeps a task's goal in sync with its project", async () => {
    const { goal } = await h.ok({ type: "goal.create", payload: { title: "건강" } });
    const { project } = await h.ok({ type: "project.create", payload: { title: "마라톤", goalId: goal.id } });
    const { task } = await h.ok({
      type: "task.create",
      payload: { title: "10km 달리기", projectId: project.id },
    });
    expect(task.goalId).toBe(goal.id);
  });

  it("records, overwrites and clears routine check-ins (unrecorded ≠ skipped)", async () => {
    const { routine } = await h.ok({
      type: "routine.create",
      payload: { title: "물 2L", schedule: { kind: "daily", startDate: "2026-09-01", endDate: null } },
    });
    let ws = await loadWorkspace(h.db, h.now);
    expect(ws.todayView.routines.find((r) => r.routineId === routine.id)?.state).toBe("unrecorded");
    await h.ok({
      type: "checkin.record",
      payload: { routineId: routine.id, date: "2026-09-28", status: "skipped" },
    });
    await h.ok({
      type: "checkin.record",
      payload: { routineId: routine.id, date: "2026-09-28", status: "done" },
    });
    ws = await loadWorkspace(h.db, h.now);
    expect(ws.checkIns.filter((c) => c.routineId === routine.id)).toHaveLength(1);
    expect(ws.todayView.routines.find((r) => r.routineId === routine.id)?.state).toBe("done");
    const cleared = await h.ok({
      type: "checkin.clear",
      payload: { routineId: routine.id, date: "2026-09-28" },
    });
    expect(cleared.removed).toBe(true);
    const future = await h.run({
      type: "checkin.record",
      payload: { routineId: routine.id, date: "2026-09-29", status: "done" },
    });
    expect(future.status).toBe(422);
  });
});

describe("INT-FIN-001 accounts and snapshots (FR-005)", () => {
  it("computes net worth from manual snapshots and keeps liabilities subtracted", async () => {
    const { account: cash } = await h.ok({
      type: "account.create",
      payload: { name: "생활비 통장", kind: "asset", category: "deposit", liquid: true },
    });
    const { account: loan } = await h.ok({
      type: "account.create",
      payload: { name: "전세 대출", kind: "liability", category: "loan" },
    });
    const { account: usd } = await h.ok({
      type: "account.create",
      payload: { name: "달러 예금", kind: "asset", category: "deposit", currency: "USD" },
    });
    await h.ok({
      type: "snapshot.add",
      payload: { accountId: cash.id, asOf: "2026-09-27", amount: "3500000" },
    });
    await h.ok({
      type: "snapshot.add",
      payload: { accountId: loan.id, asOf: "2026-09-27", amount: "50000000" },
    });
    const noFx = await h.run({
      type: "snapshot.add",
      payload: { accountId: usd.id, asOf: "2026-09-27", amount: "1000" },
    });
    expect(noFx.body.error.code).toBe("FX_RATE_REQUIRED");
    const fx = await h.ok({
      type: "snapshot.add",
      payload: { accountId: usd.id, asOf: "2026-09-27", amount: "1000.5", fxRate: "1385.2" },
    });
    expect(fx.snapshot.amountKrw).toBe("1385893");
    expect(fx.netWorth.netWorthKrw).toBe("-45114107");
    expect(fx.netWorth.liquidAssetsKrw).toBe("3500000");

    const dup = await h.run({
      type: "snapshot.add",
      payload: { accountId: cash.id, asOf: "2026-09-27", amount: "1" },
    });
    expect(dup.body.error.code).toBe("SNAPSHOT_EXISTS");
    await h.ok({
      type: "snapshot.add",
      payload: { accountId: cash.id, asOf: "2026-09-27", amount: "3600000", replace: true },
    });

    const excluded = await h.run({
      type: "account.update",
      payload: { accountId: loan.id, expectedVersion: 1, patch: { included: false } },
    });
    expect(excluded.body.error.code).toBe("LIABILITY_ALWAYS_INCLUDED");
    const archived = await h.ok({
      type: "account.archive",
      payload: { accountId: loan.id, expectedVersion: 1, reason: "상환 완료" },
    });
    expect(archived.account.archiveReason).toBe("상환 완료");
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.netWorth.netWorthKrw).toBe("4985893");
    const blocked = await h.run({
      type: "snapshot.add",
      payload: { accountId: loan.id, asOf: "2026-09-28", amount: "0" },
    });
    expect(blocked.body.error.code).toBe("ACCOUNT_ARCHIVED");
  });
});

describe("INT-NOTE-001 notes, revisions and backlinks (FR-006)", () => {
  it("saves with revisions, derives text and replaces links", async () => {
    const { note: target } = await h.ok({ type: "note.create", payload: { title: "대상" } });
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "참고: " },
            { type: "noteLink", attrs: { targetType: "note", targetId: target.id, label: "대상" } },
          ],
        },
      ],
    };
    const { note } = await h.ok({ type: "note.create", payload: { title: "원본", tags: ["Work"] } });
    const saved = await h.ok({
      type: "note.save",
      payload: {
        noteId: note.id,
        expectedVersion: 1,
        title: "원본",
        document: doc,
        tags: ["work"],
        projectId: null,
        goalId: null,
      },
    });
    expect(saved.note.text).toBe("참고: 대상");
    expect(saved.note.links).toHaveLength(1);
    expect(saved.revision.version).toBe(1);

    const detail = await loadNoteDetail(h.db, target.id);
    expect(detail.backlinks.map((l) => l.sourceNoteId)).toEqual([note.id]);

    const conflict = await h.run({
      type: "note.save",
      payload: {
        noteId: note.id,
        expectedVersion: 1,
        title: "충돌",
        document: doc,
        tags: [],
        projectId: null,
        goalId: null,
      },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.current.title).toBe("원본");

    const restored = await h.ok({
      type: "note.restoreRevision",
      payload: { noteId: note.id, expectedVersion: 2, revisionId: saved.revision.id },
    });
    expect(restored.note.links).toHaveLength(0); // the first revision had no link
    expect((await loadNoteDetail(h.db, target.id)).backlinks).toHaveLength(0);
    expect((await noteMarkdown(h.db, note.id)).markdown).toContain("# 원본");

    const unsafe = await h.run({
      type: "note.save",
      payload: {
        noteId: note.id,
        expectedVersion: 3,
        title: "x",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        },
        tags: [],
        projectId: null,
        goalId: null,
      },
    });
    expect(unsafe.status).toBe(422);
  });
});

describe("INT-INBOX-001 inbox and receipts (FR-007)", () => {
  it("converts captures once and keeps the relation", async () => {
    const { item } = await h.ok({
      type: "inbox.create",
      payload: { kind: "text", text: "치과 예약\n다음 주 화요일" },
    });
    const converted = await h.ok({
      type: "inbox.convert",
      payload: { itemId: item.id, target: { type: "task" } },
    });
    expect(converted.created.task.title).toBe("치과 예약");
    expect(converted.item.convertedTo).toEqual({ type: "task", id: converted.created.task.id });
    const again = await h.run({ type: "inbox.archive", payload: { itemId: item.id } });
    expect(again.body.error.code).toBe("STATE_TRANSITION_INVALID");
    const noImage = await h.run({
      type: "inbox.create",
      payload: { kind: "url", url: "https://example.com" },
    });
    const receipt = await h.run({
      type: "inbox.convert",
      payload: { itemId: noImage.body.result.item.id, target: { type: "receipt" } },
    });
    expect(receipt.status).toBe(422);
  });
});

describe("INT-REVIEW-001 reviews (FR-009)", () => {
  it("upserts by period key and preserves owner text on regeneration", async () => {
    const first = await h.ok({ type: "review.generate", payload: { kind: "weekly", date: "2026-09-28" } });
    expect(first.review.key).toBe("weekly:2026-W40");
    expect(first.regenerated).toBe(false);
    const edited = await h.ok({
      type: "review.update",
      payload: { reviewId: first.review.id, expectedVersion: 1, owner: { notes: "내 메모" } },
    });
    const second = await h.ok({ type: "review.generate", payload: { kind: "weekly", date: "2026-09-28" } });
    expect(second.regenerated).toBe(true);
    expect(second.review.id).toBe(first.review.id);
    expect(second.review.owner.notes).toBe("내 메모");
    expect(second.review.inputsHash).toBe(edited.review.inputsHash);
    await h.ok({
      type: "review.finalize",
      payload: { reviewId: first.review.id, expectedVersion: second.review.version },
    });
    const locked = await h.run({ type: "review.generate", payload: { kind: "weekly", date: "2026-09-28" } });
    expect(locked.body.error.code).toBe("STATE_TRANSITION_INVALID");
  });
});

describe("INT-AI-CONSENT-001 / INT-CAL-001 disconnected integrations (FR-008, FR-009)", () => {
  it("refuses AI preview until configured and never calls a provider", async () => {
    const { note } = await h.ok({ type: "note.create", payload: { title: "일기" } });
    const res = await h.run({ type: "analysis.preview", payload: { purpose: "요약", noteIds: [note.id] } });
    expect(res.status).toBe(412);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("keeps calendar proposals pending while Google is disconnected", async () => {
    const { proposal } = await h.ok({
      type: "calendar.propose",
      payload: {
        kind: "calendar.create",
        draft: {
          title: "병원",
          description: "",
          location: null,
          when: { allDay: true, startDate: "2026-10-01", endDate: "2026-10-01" },
        },
      },
    });
    const approve = await h.run({
      type: "calendar.approve",
      payload: { proposalId: proposal.id, expectedVersion: 1 },
    });
    expect(approve.status).toBe(412);
    expect(approve.body.error.code).toBe("INTEGRATION_DISCONNECTED");
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.proposals.find((p) => p.id === proposal.id)?.status).toBe("pending");
    expect(ws.connections.every((c) => c.status === "disconnected")).toBe(true);
    expect(h.jobs.sent.filter((j) => j.name === "google.applyProposal")).toHaveLength(0);
  });

  it("shows local events on the day they happen", async () => {
    const { event } = await h.ok({
      type: "calendar.event.create",
      payload: {
        title: "요가",
        when: { allDay: false, start: "2026-09-28T10:00:00.000Z", end: "2026-09-28T11:00:00.000Z" },
      },
    });
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.todayView.calendarEventIds).toContain(event.id);
  });
});

describe("INT-API-001 client-supplied ids", () => {
  it("answers 422 (not 500) when a client reuses an existing id", async () => {
    const { account } = await h.ok({
      type: "account.create",
      payload: { name: "a", kind: "asset", category: "cash" },
    });
    const dup = await h.run({
      type: "account.create",
      payload: { id: account.id, name: "b", kind: "asset", category: "cash" },
    });
    expect(dup.status).toBe(422);
  });
});

describe("SEC-001 read model has no secrets", () => {
  it("never exposes token hashes or connection secrets", async () => {
    const created = await h.ok({
      type: "token.create",
      payload: { label: "iPhone", scope: "capture" },
      idempotencyKey: "token-create-0001",
    });
    expect(created.secret).toMatch(/^lrc_/);
    const logged = await h.db.execute(sql`select response::text as r from command_log`);
    expect(JSON.stringify(logged.rows)).not.toContain(created.secret);
    const ws = await loadWorkspace(h.db, h.now);
    const json = JSON.stringify(ws);
    expect(json).not.toContain(created.secret);
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain("syncState");
    expect(ws.apiTokens[0]?.prefix).toBe(created.secret.slice(0, 8));
  });
});

describe("INT-COLLECTION-001 collections (FR-006)", () => {
  it("validates typed values and prunes removed properties", async () => {
    const properties: [CollectionProperty, CollectionProperty] = [
      {
        id: "title",
        name: "제목",
        type: "text",
        options: [],
        relationCollectionId: null,
        required: true,
        sortOrder: 0,
      },
      {
        id: "state",
        name: "상태",
        type: "status",
        options: [
          { id: "todo", label: "할 일", color: null },
          { id: "done", label: "완료", color: null },
        ],
        relationCollectionId: null,
        required: false,
        sortOrder: 1,
      },
    ];
    const views: CollectionView[] = [
      {
        id: "board",
        name: "보드",
        kind: "board",
        groupByPropertyId: "state",
        datePropertyId: null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ];
    const { collection } = await h.ok({
      type: "collection.create",
      payload: { name: "독서", properties, views },
    });
    const bad = await h.run({
      type: "collection.record.create",
      payload: { collectionId: collection.id, values: { state: { type: "status", value: "nope" } } },
    });
    expect(bad.status).toBe(422);
    const { record } = await h.ok({
      type: "collection.record.create",
      payload: {
        collectionId: collection.id,
        values: { title: { type: "text", value: "책" }, state: { type: "status", value: "todo" } },
      },
    });
    const badView = await h.run({
      type: "collection.update",
      payload: { collectionId: collection.id, expectedVersion: 1, patch: { properties: [properties[0]] } },
    });
    expect(badView.status).toBe(422); // the board would lose its group-by property
    await h.ok({
      type: "collection.update",
      payload: {
        collectionId: collection.id,
        expectedVersion: 1,
        patch: {
          properties: [properties[0]],
          views: [
            {
              id: "table",
              name: "표",
              kind: "table",
              groupByPropertyId: null,
              datePropertyId: null,
              sorts: [],
              filters: [],
              visiblePropertyIds: [],
            },
          ],
        },
      },
    });
    const ws = await loadWorkspace(h.db, h.now);
    const pruned = ws.collectionRecords.find((r) => r.id === record.id)!;
    expect(Object.keys(pruned.values)).toEqual(["title"]);
    expect(pruned.version).toBe(2);
  });
});
