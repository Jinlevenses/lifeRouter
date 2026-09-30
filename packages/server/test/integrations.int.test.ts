import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiUsage, connections } from "../src/db/schema";
import {
  disconnectedIntegrations,
  IntegrationError,
  type CalendarProvider,
  type GoogleEvent,
  type GoogleTokens,
} from "../src/integrations";
import { GoogleCalendarProvider } from "../src/integrations/google";
import { sealJson } from "../src/ops/secret-box";
import { applyProposal, googleSync } from "../src/worker/google";
import { runAnalysis } from "../src/worker/jobs";
import { loadWorkspace } from "../src/workspace";
import { freshDb, harness, type Harness } from "./helpers";

let h: Harness;
let close: () => Promise<void>;

/** In-memory Google Calendar: enough behaviour to exercise sync tokens, etags and managed writes. */
class FakeCalendar implements CalendarProvider {
  readonly available = true;
  events = new Map<string, GoogleEvent & { calendarId: string }>();
  syncCalls: { calendarId: string; syncToken?: string }[] = [];
  expireNextSyncToken = false;
  authUrl() {
    return "https://example.test/auth";
  }
  async exchangeCode(): Promise<GoogleTokens> {
    return { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "" };
  }
  async refresh(t: GoogleTokens) {
    return t;
  }
  async listCalendars() {
    return [{ id: "primary", summary: "me", primary: true }];
  }
  async createCalendar() {
    return { id: "managed" };
  }
  async listEvents(_t: GoogleTokens, calendarId: string, params: { syncToken?: string }) {
    this.syncCalls.push({ calendarId, syncToken: params.syncToken });
    if (params.syncToken && this.expireNextSyncToken) {
      this.expireNextSyncToken = false;
      throw new IntegrationError("gone", "gone");
    }
    return {
      events: [...this.events.values()].filter((e) => e.calendarId === calendarId),
      nextSyncToken: `sync-${this.syncCalls.length}`,
    };
  }
  async findByLocalId(_t: GoogleTokens, calendarId: string, localId: string) {
    return (
      [...this.events.values()].find(
        (e) =>
          e.calendarId === calendarId &&
          e.extendedProperties?.private?.["liferoute.id"] === localId &&
          e.status !== "cancelled",
      ) ?? null
    );
  }
  async insertEvent(_t: GoogleTokens, calendarId: string, draft: { title: string }, localId: string) {
    const id = `g${this.events.size + 1}`;
    const event = {
      id,
      calendarId,
      etag: `"${id}-1"`,
      status: "confirmed" as const,
      summary: draft.title,
      start: { date: "2026-10-01" },
      end: { date: "2026-10-02" },
      extendedProperties: { private: { "liferoute.managed": "true", "liferoute.id": localId } },
    };
    this.events.set(id, event);
    return event;
  }
  async patchEvent(
    _t: GoogleTokens,
    _c: string,
    eventId: string,
    etag: string | null,
    draft: { title: string },
  ) {
    const e = this.events.get(eventId)!;
    if (etag !== e.etag) throw new IntegrationError("precondition failed", "conflict");
    const next = {
      ...e,
      summary: draft.title,
      etag: `"${eventId}-${Number(e.etag.split("-")[1]!.replace('"', "")) + 1}"`,
    };
    this.events.set(eventId, next);
    return next;
  }
  async deleteEvent(_t: GoogleTokens, _c: string, eventId: string) {
    const e = this.events.get(eventId)!;
    this.events.set(eventId, { ...e, status: "cancelled", etag: `${e.etag}x` });
  }
}

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
  const t = await freshDb();
  close = t.close;
  h = harness(t.db);
});
afterAll(async () => close());

describe("INT-GCAL-001 / INT-GCAL-002 Google read sync and approved managed writes (FR-008, ADR-003)", () => {
  it("writes to Google only after approval, only in the managed calendar, and never overwrites a newer event", async () => {
    const google = new FakeCalendar();
    h.integrations = { ...disconnectedIntegrations(), calendar: google };
    await loadWorkspace(h.db, h.now); // seeds connection rows
    await h.db
      .update(connections)
      .set({
        status: "connected",
        secret: sealJson({
          accessToken: "a",
          refreshToken: "r",
          expiresAt: Date.now() + 3_600_000,
          scope: "",
        }),
        meta: { calendarIds: ["primary"], managedCalendarId: "managed" },
      })
      .where(eq(connections.provider, "google"));

    // An external event is read, never written.
    google.events.set("ext1", {
      id: "ext1",
      calendarId: "primary",
      etag: '"e1"',
      status: "confirmed",
      summary: "친구 결혼식",
      start: { date: "2026-10-03" },
      end: { date: "2026-10-04" },
    });
    await googleSync(h.db, google, h.now);
    let ws = await loadWorkspace(h.db, h.now);
    const external = ws.calendarEvents.find((e) => e.externalId === "ext1")!;
    expect(external).toMatchObject({
      source: "google",
      managed: false,
      when: { allDay: true, startDate: "2026-10-03", endDate: "2026-10-03" },
    });
    const direct = await h.run({
      type: "calendar.event.update",
      payload: { eventId: external.id, expectedVersion: external.version, patch: { title: "x" } },
    });
    expect(direct.body.error.code).toBe("USE_PROPOSAL");
    const notManaged = await h.run({
      type: "calendar.propose",
      payload: {
        kind: "calendar.delete",
        calendarEventId: external.id,
        expectedEventVersion: external.version,
      },
    });
    expect(notManaged.body.error.code).toBe("NOT_MANAGED_EVENT");

    // Proposal → approval → worker applies into the managed calendar.
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
    expect(google.events.size).toBe(1);
    const approved = await h.ok({
      type: "calendar.approve",
      payload: { proposalId: proposal.id, expectedVersion: proposal.version },
    });
    expect(approved.jobQueued).toBe(true);
    expect(h.jobs.sent.at(-1)).toMatchObject({ name: "google.applyProposal" });
    await applyProposal(h.db, google, proposal.id, h.now);
    const created = [...google.events.values()].find((e) => e.summary === "병원")!;
    expect(created.calendarId).toBe("managed");
    ws = await loadWorkspace(h.db, h.now);
    expect(ws.proposals.find((p) => p.id === proposal.id)?.status).toBe("applied");
    const managed = ws.calendarEvents.find((e) => e.externalId === created.id)!;
    expect(managed.managed).toBe(true);

    // Someone edits the event in Google first → our stale update fails instead of overwriting.
    const { proposal: update } = await h.ok({
      type: "calendar.propose",
      payload: {
        kind: "calendar.update",
        calendarEventId: managed.id,
        expectedEventVersion: managed.version,
        draft: {
          title: "병원 (변경)",
          description: "",
          location: null,
          when: { allDay: true, startDate: "2026-10-01", endDate: "2026-10-01" },
        },
      },
    });
    await h.ok({
      type: "calendar.approve",
      payload: { proposalId: update.id, expectedVersion: update.version },
    });
    google.events.set(created.id, { ...created, etag: '"changed-elsewhere"' });
    await applyProposal(h.db, google, update.id, h.now);
    ws = await loadWorkspace(h.db, h.now);
    expect(ws.proposals.find((p) => p.id === update.id)).toMatchObject({ status: "failed" });
    expect(google.events.get(created.id)?.summary).toBe("병원");

    // Re-running an apply (retry after a crash) never duplicates the Google event.
    const { proposal: again } = await h.ok({
      type: "calendar.propose",
      payload: {
        kind: "calendar.create",
        draft: {
          title: "치과",
          description: "",
          location: null,
          when: { allDay: true, startDate: "2026-10-02", endDate: "2026-10-02" },
        },
      },
    });
    await h.ok({
      type: "calendar.approve",
      payload: { proposalId: again.id, expectedVersion: again.version },
    });
    const partial = await google.insertEvent(
      {} as GoogleTokens,
      "managed",
      { title: "치과" } as never,
      again.id,
    ); // first attempt got this far, then crashed
    await applyProposal(h.db, google, again.id, h.now);
    expect([...google.events.values()].filter((e) => e.summary === "치과")).toHaveLength(1);
    ws = await loadWorkspace(h.db, h.now);
    expect(ws.calendarEvents.find((e) => e.id === again.id)?.externalId).toBe(partial.id);
  });

  it("resyncs fully when Google expires the sync token (410)", async () => {
    const google = new FakeCalendar();
    await googleSync(h.db, google, h.now); // stores a sync token per calendar
    const before = google.syncCalls.length;
    google.expireNextSyncToken = true;
    await googleSync(h.db, google, h.now);
    const calls = google.syncCalls.slice(before);
    // The expired incremental call is followed by a full (token-less) sync of the same calendar.
    expect(calls[0]).toMatchObject({ calendarId: "primary" });
    expect(calls[0]!.syncToken).toBeDefined();
    expect(calls[1]).toEqual({ calendarId: "primary", syncToken: undefined });
  });

  it("marks the connection for re-consent on auth errors", async () => {
    const google = new FakeCalendar();
    google.listEvents = async () => {
      throw new IntegrationError("invalid_grant", "auth");
    };
    await expect(googleSync(h.db, google, h.now)).rejects.toThrow();
    const ws = await loadWorkspace(h.db, h.now);
    expect(ws.connections.find((c) => c.provider === "google")?.status).toBe("reauth_required");
  });

  it("builds a minimal-scope OAuth URL", () => {
    const url = new URL(
      new GoogleCalendarProvider("id", "secret").authUrl(
        "state123",
        "http://localhost:3000/api/v1/auth/google/callback",
      ),
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created",
    );
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("INT-AI-001 consented analysis and usage ledger (FR-009, docs/15_ai)", () => {
  it("sends only the consented notes and records actual cost within the monthly cap", async () => {
    const sent: string[] = [];
    h.integrations = {
      ...disconnectedIntegrations(),
      ai: {
        ...disconnectedIntegrations().ai,
        openai: {
          name: "openai",
          available: true,
          analyze: async (input) => {
            sent.push(...input.documents.map((d) => d.title));
            return { text: "요약 결과", model: input.model, inputTokens: 1200, outputTokens: 300 };
          },
        },
      },
    };
    const { settings } = await h.ok({
      type: "settings.update",
      payload: {
        expectedVersion: (await loadWorkspace(h.db, h.now)).settings.version,
        patch: {
          ai: {
            provider: "openai",
            model: "gpt-5.4-mini",
            inputKrwPer1MTokens: "7000",
            outputKrwPer1MTokens: "35000",
          },
        },
      },
    });
    expect(settings.ai.provider).toBe("openai");
    const { note: chosen } = await h.ok({ type: "note.create", payload: { title: "선택한 노트" } });
    await h.ok({ type: "note.create", payload: { title: "보내면 안 되는 노트" } });

    const { analysis, budget } = await h.ok({
      type: "analysis.preview",
      payload: { purpose: "요약", noteIds: [chosen.id] },
    });
    expect(analysis.status).toBe("previewed");
    expect(budget.remainingKrw).toBe("3000");
    const stale = await h.run({
      type: "analysis.execute",
      payload: {
        analysisId: analysis.id,
        expectedVersion: analysis.version,
        consent: true,
        consentEstimateKrw: "1",
      },
    });
    expect(stale.body.error.code).toBe("AI_CONSENT_STALE");
    const fresh = (await loadWorkspace(h.db, h.now)).analyses.find((a) => a.id === analysis.id)!;
    const queued = await h.ok({
      type: "analysis.execute",
      payload: {
        analysisId: fresh.id,
        expectedVersion: fresh.version,
        consent: true,
        consentEstimateKrw: fresh.estimate!.costKrw,
      },
    });
    expect(queued.analysis.status).toBe("queued");
    expect((await loadWorkspace(h.db, h.now)).aiBudget.reservedKrw).toBe(fresh.estimate!.costKrw);

    await runAnalysis(h.db, h.integrations, analysis.id, h.now);
    expect(sent).toEqual(["선택한 노트"]);
    const ws = await loadWorkspace(h.db, h.now);
    const done = ws.analyses.find((a) => a.id === analysis.id)!;
    expect(done).toMatchObject({ status: "completed", resultText: "요약 결과", provider: "openai" });
    const [usage] = await h.db.select().from(aiUsage);
    expect(usage).toMatchObject({ provider: "openai", model: "gpt-5.4-mini", inputTokens: 1200 });
    // 1200 × 7000 + 300 × 35000 = 18.9 → 19 KRW (rounded up); reservation released.
    expect(ws.aiBudget).toMatchObject({ usedKrw: "19", reservedKrw: "0", remainingKrw: "2981" });
  });

  it("blocks a preview that would exceed the 3,000 KRW monthly budget", async () => {
    const { note } = await h.ok({ type: "note.create", payload: { title: "긴 노트" } });
    const ws = await loadWorkspace(h.db, h.now);
    await h.ok({
      type: "settings.update",
      payload: {
        expectedVersion: ws.settings.version,
        patch: { ai: { maxOutputTokens: 20000, outputKrwPer1MTokens: "200000" } },
      },
    });
    const res = await h.run({ type: "analysis.preview", payload: { purpose: "요약", noteIds: [note.id] } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("AI_BUDGET_EXCEEDED");
  });
});
