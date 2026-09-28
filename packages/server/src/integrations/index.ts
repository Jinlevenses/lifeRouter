import { disconnectedAi, disconnectedBalance, disconnectedCalendar, unavailableOcr } from "./disconnected";
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
  const ai = env.ANTHROPIC_API_KEY
    ? new (await import("./anthropic")).AnthropicProvider(env.ANTHROPIC_API_KEY)
    : disconnectedAi;
  return { calendar, balance: disconnectedBalance, ocr: unavailableOcr, ai };
}

export async function getIntegrations(): Promise<Integrations> {
  const g = globalThis as GlobalWithIntegrations;
  if (!g[key]) g[key] = await integrationsFromEnv();
  return g[key];
}

export function disconnectedIntegrations(): Integrations {
  return {
    calendar: disconnectedCalendar,
    balance: disconnectedBalance,
    ocr: unavailableOcr,
    ai: disconnectedAi,
  };
}
