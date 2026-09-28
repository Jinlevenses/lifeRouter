import { TIMEZONE, type CalendarEventDraft } from "@liferoute/contracts";
import { addDays } from "@liferoute/core";
import { maskSecrets } from "../logger";
import { IntegrationError, type CalendarProvider, type GoogleEvent, type GoogleTokens } from "./types";

/**
 * Google Calendar over REST (FR-008, review D-41/D-42).
 * Scopes: read every calendar (calendar.readonly) and write only to calendars this app created
 * (calendar.app.created) — so the API itself confines writes to the managed "LifeRoute" calendar.
 * Policies and scope names must be re-checked against Google's docs before connecting (docs/06).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

type FetchLike = typeof fetch;

export class GoogleCalendarProvider implements CalendarProvider {
  readonly available = true;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  authUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  private async token(body: Record<string, string>): Promise<GoogleTokens & { refreshToken: string | null }> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...body }),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const kind = json.error === "invalid_grant" ? "auth" : response.status >= 500 ? "transient" : "config";
      throw new IntegrationError(`Google token error: ${String(json.error ?? response.status)}`, kind);
    }
    return {
      accessToken: String(json.access_token),
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
      scope: String(json.scope ?? ""),
    } as GoogleTokens & { refreshToken: string | null };
  }

  async exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
    const t = await this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.refreshToken) throw new IntegrationError("Google did not return a refresh token", "auth");
    return t as GoogleTokens;
  }

  async refresh(tokens: GoogleTokens): Promise<GoogleTokens> {
    if (tokens.expiresAt - Date.now() > 60_000) return tokens;
    const t = await this.token({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? tokens.refreshToken };
  }

  private async call<T>(
    tokens: GoogleTokens,
    path: string,
    init: RequestInit & { etag?: string | null } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${tokens.accessToken}` };
    if (init.body) headers["content-type"] = "application/json";
    if (init.etag) headers["if-match"] = init.etag;
    const response = await this.fetchImpl(`${API}${path}`, { ...init, headers });
    if (response.status === 204) return undefined as T;
    if (!response.ok) {
      const text = maskSecrets(await response.text().catch(() => ""));
      // 403 can be a rate/quota limit rather than revoked access; only real auth failures need re-consent.
      const rateLimited =
        response.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(text);
      const kind =
        response.status === 401 || (response.status === 403 && !rateLimited)
          ? "auth"
          : response.status === 410
            ? "gone"
            : response.status === 412
              ? "conflict"
              : response.status === 404
                ? "notFound"
                : rateLimited || response.status === 429 || response.status >= 500
                  ? "transient"
                  : "config";
      throw new IntegrationError(`Google API ${response.status}: ${text.slice(0, 200)}`, kind);
    }
    return (await response.json()) as T;
  }

  async listCalendars(tokens: GoogleTokens) {
    const out: { id: string; summary: string; primary: boolean }[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      const page = await this.call<{
        items?: { id: string; summary?: string; primary?: boolean }[];
        nextPageToken?: string;
      }>(tokens, `/users/me/calendarList?${q}`);
      for (const c of page.items ?? [])
        out.push({ id: c.id, summary: c.summary ?? c.id, primary: !!c.primary });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async createCalendar(tokens: GoogleTokens, summary: string) {
    return this.call<{ id: string }>(tokens, "/calendars", {
      method: "POST",
      body: JSON.stringify({ summary, timeZone: TIMEZONE }),
    });
  }

  async listEvents(
    tokens: GoogleTokens,
    calendarId: string,
    params: { syncToken?: string; timeMin?: string },
  ) {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    do {
      const q = new URLSearchParams({
        maxResults: "250",
        singleEvents: "true",
        showDeleted: "true",
        ...(params.syncToken
          ? { syncToken: params.syncToken }
          : { timeMin: params.timeMin ?? new Date().toISOString() }),
        ...(pageToken ? { pageToken } : {}),
      });
      const page = await this.call<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
        tokens,
        `/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
      );
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  }

  private body(draft: CalendarEventDraft, localId?: string) {
    const when = draft.when;
    return {
      summary: draft.title,
      description: draft.description,
      location: draft.location ?? undefined,
      start: when.allDay ? { date: when.startDate } : { dateTime: when.start, timeZone: TIMEZONE },
      // Google's all-day end date is exclusive; ours is inclusive.
      end: when.allDay ? { date: addDays(when.endDate, 1) } : { dateTime: when.end, timeZone: TIMEZONE },
      ...(localId
        ? { extendedProperties: { private: { "liferoute.managed": "true", "liferoute.id": localId } } }
        : {}),
    };
  }

  async findByLocalId(tokens: GoogleTokens, calendarId: string, localId: string) {
    const q = new URLSearchParams({ privateExtendedProperty: `liferoute.id=${localId}`, maxResults: "5" });
    const page = await this.call<{ items?: GoogleEvent[] }>(
      tokens,
      `/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
    );
    return (page.items ?? []).find((e) => e.status !== "cancelled") ?? null;
  }

  async insertEvent(tokens: GoogleTokens, calendarId: string, draft: CalendarEventDraft, localId: string) {
    return this.call<GoogleEvent>(tokens, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify(this.body(draft, localId)),
    });
  }

  async patchEvent(
    tokens: GoogleTokens,
    calendarId: string,
    eventId: string,
    etag: string | null,
    draft: CalendarEventDraft,
  ) {
    return this.call<GoogleEvent>(
      tokens,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(this.body(draft)),
        etag,
      },
    );
  }

  async deleteEvent(tokens: GoogleTokens, calendarId: string, eventId: string, etag: string | null) {
    await this.call<void>(
      tokens,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        etag,
      },
    );
  }
}
