import {
  IntegrationError,
  type AiProvider,
  type BalanceProvider,
  type CalendarProvider,
  type OcrEngine,
} from "./types";

const disconnected = (what: string) => () => {
  throw new IntegrationError(`${what} is not configured`, "config");
};

export const disconnectedCalendar: CalendarProvider = {
  available: false,
  authUrl: disconnected("Google Calendar"),
  exchangeCode: disconnected("Google Calendar"),
  refresh: disconnected("Google Calendar"),
  listCalendars: disconnected("Google Calendar"),
  createCalendar: disconnected("Google Calendar"),
  listEvents: disconnected("Google Calendar"),
  findByLocalId: disconnected("Google Calendar"),
  insertEvent: disconnected("Google Calendar"),
  patchEvent: disconnected("Google Calendar"),
  deleteEvent: disconnected("Google Calendar"),
};

/** Toss: interface only until the owner confirms the official read-only API and credentials (review Q-2). */
export const disconnectedBalance: BalanceProvider = {
  available: false,
  fetchBalances: disconnected("Toss"),
};

export const unavailableOcr: OcrEngine = {
  name: "unavailable",
  available: false,
  recognize: disconnected("OCR"),
};

export const disconnectedAi: AiProvider = {
  name: "disconnected",
  available: false,
  analyze: disconnected("AI provider"),
};
