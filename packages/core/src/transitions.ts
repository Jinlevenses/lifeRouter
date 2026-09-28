import { ANALYSIS_TRANSITIONS, INBOX_TRANSITIONS, PROPOSAL_TRANSITIONS } from "@liferoute/contracts";

/** State machines fixed by the contract (review D-35/D-40/D-51). */
const TABLES = {
  inbox: INBOX_TRANSITIONS,
  proposal: PROPOSAL_TRANSITIONS,
  analysis: ANALYSIS_TRANSITIONS,
} as const;

export function canTransition<K extends keyof typeof TABLES>(machine: K, from: string, to: string): boolean {
  const table = TABLES[machine] as Readonly<Record<string, readonly string[]>>;
  return table[from]?.includes(to) ?? false;
}
