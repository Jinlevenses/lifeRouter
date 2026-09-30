import type { CalendarEventDraft, ReceiptFields } from "@liferoute/contracts";

/**
 * Integration adapters (review D-38, D-42, D-43, D-50, D-57). The app boots and is fully usable with
 * the Disconnected/Unavailable defaults; a real adapter is injected only when every credential is present.
 */
export interface OcrResult {
  rawText: string;
  fields: Partial<{ [K in keyof ReceiptFields]: { value: ReceiptFields[K]["value"]; confidence: number } }>;
}
export interface OcrEngine {
  readonly name: string;
  readonly available: boolean;
  recognize(file: Buffer, mime: string): Promise<OcrResult>;
}

export interface AiAnalyzeInput {
  model: string;
  purpose: string;
  documents: { title: string; text: string }[];
  maxOutputTokens: number;
}
export interface AiAnalyzeResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}
export type AiProviderName = "openai" | "anthropic";
export interface AiProvider {
  readonly name: "disconnected" | AiProviderName;
  readonly available: boolean;
  analyze(input: AiAnalyzeInput): Promise<AiAnalyzeResult>;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}
export interface GoogleEvent {
  id: string;
  etag: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}
export interface CalendarProvider {
  readonly available: boolean;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  refresh(tokens: GoogleTokens): Promise<GoogleTokens>;
  listCalendars(tokens: GoogleTokens): Promise<{ id: string; summary: string; primary: boolean }[]>;
  createCalendar(tokens: GoogleTokens, summary: string): Promise<{ id: string }>;
  listEvents(
    tokens: GoogleTokens,
    calendarId: string,
    params: { syncToken?: string; timeMin?: string },
  ): Promise<{ events: GoogleEvent[]; nextSyncToken: string | null }>;
  /** The event previously written for `localId` (extendedProperties liferoute.id), if any. */
  findByLocalId(tokens: GoogleTokens, calendarId: string, localId: string): Promise<GoogleEvent | null>;
  insertEvent(
    tokens: GoogleTokens,
    calendarId: string,
    draft: CalendarEventDraft,
    localId: string,
  ): Promise<GoogleEvent>;
  patchEvent(
    tokens: GoogleTokens,
    calendarId: string,
    eventId: string,
    etag: string | null,
    draft: CalendarEventDraft,
  ): Promise<GoogleEvent>;
  deleteEvent(tokens: GoogleTokens, calendarId: string, eventId: string, etag: string | null): Promise<void>;
}

/** Q-2: one adapter per Toss product (토스뱅크 잔액, 토스증권 잔고); read-only. */
export interface BalanceProvider {
  readonly product: "toss_bank" | "toss_securities";
  readonly available: boolean;
  fetchBalances(): Promise<{ externalAccountId: string; amount: string; currency: string; asOf: string }[]>;
}

export interface Integrations {
  /** Google OAuth client configured (connecting is possible). Connection status says whether it is connected. */
  calendar: CalendarProvider;
  balance: { toss_bank: BalanceProvider; toss_securities: BalanceProvider };
  ocr: OcrEngine;
  /** One adapter per provider; the owner's Settings choose which one an analysis uses. */
  ai: Record<AiProviderName, AiProvider>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "gone" | "conflict" | "notFound" | "transient" | "config",
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}
