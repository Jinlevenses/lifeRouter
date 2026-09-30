import {
  AI_MONTHLY_BUDGET_KRW_DEFAULT,
  FINANCE_GOAL_AMOUNT_KRW_DEFAULT,
  FINANCE_GOAL_MONTHS_DEFAULT,
  SNAPSHOT_STALE_AFTER_DAYS_DEFAULT,
} from "@liferoute/contracts";
import { addMonths } from "@liferoute/core";
import { randomUUID } from "node:crypto";
import type { DbOrTx } from "./db/client";
import { connections, settings } from "./db/schema";

/**
 * Default rows (review D-17, D-45): the goal window starts on the first run and ends 36 months later;
 * every integration starts "disconnected" until the owner configures credentials.
 */
export function defaultSettings(today: string): typeof settings.$inferInsert {
  return {
    id: "settings",
    finance: {
      goalAmountKrw: FINANCE_GOAL_AMOUNT_KRW_DEFAULT,
      goalStartDate: today,
      goalTargetDate: addMonths(today, FINANCE_GOAL_MONTHS_DEFAULT),
      staleAfterDays: SNAPSHOT_STALE_AFTER_DAYS_DEFAULT,
    },
    ai: {
      monthlyBudgetKrw: AI_MONTHLY_BUDGET_KRW_DEFAULT,
      provider: "disconnected",
      model: process.env.LIFEROUTE_AI_MODEL || null,
      inputKrwPer1MTokens: null,
      outputKrwPer1MTokens: null,
      charsPerToken: 2,
      maxOutputTokens: 2000,
    },
    backup: { enabled: true, dailyAt: "03:30", retention: { daily: 7, weekly: 4, monthly: 12 } },
    capture: { defaultConvertTarget: "task" },
  };
}

export async function ensureSeeded(db: DbOrTx, today: string): Promise<void> {
  await db.insert(settings).values(defaultSettings(today)).onConflictDoNothing();
  for (const provider of ["google", "toss_bank", "toss_securities", "ai"] as const) {
    await db.insert(connections).values({ id: randomUUID(), provider }).onConflictDoNothing();
  }
}
