import {
  disconnectedAi,
  disconnectedCalendar,
  disconnectedTossBank,
  disconnectedTossSecurities,
  unavailableOcr,
} from "./disconnected";
import type { Integrations } from "./types";

export * from "./types";
export * from "./disconnected";

const key = Symbol.for("liferoute.integrations");
type GlobalWithIntegrations = typeof globalThis & { [key]?: Integrations };

/** Selects adapters from the environment: real ones only when every credential is present (D-57). */
export async function integrationsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Integrations> {
  const calendar =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? new (await import("./google")).GoogleCalendarProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
      : disconnectedCalendar;
  const ai = {
    openai: env.OPENAI_API_KEY
      ? new (await import("./openai")).OpenAiProvider(env.OPENAI_API_KEY)
      : disconnectedAi,
    anthropic: env.ANTHROPIC_API_KEY
      ? new (await import("./anthropic")).AnthropicProvider(env.ANTHROPIC_API_KEY)
      : disconnectedAi,
  };
  // Toss adapters stay disconnected until the official read-only APIs are wired (Q-2, INT-003).
  const balance = { toss_bank: disconnectedTossBank, toss_securities: disconnectedTossSecurities };
  return { calendar, balance, ocr: unavailableOcr, ai };
}

export async function getIntegrations(): Promise<Integrations> {
  const g = globalThis as GlobalWithIntegrations;
  if (!g[key]) g[key] = await integrationsFromEnv();
  return g[key];
}

export function disconnectedIntegrations(): Integrations {
  return {
    calendar: disconnectedCalendar,
    balance: { toss_bank: disconnectedTossBank, toss_securities: disconnectedTossSecurities },
    ocr: unavailableOcr,
    ai: { openai: disconnectedAi, anthropic: disconnectedAi },
  };
}
