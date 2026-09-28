import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { JOB_NAMES } from "@liferoute/contracts";
import { getDb } from "@liferoute/server/db";
import { connections } from "@liferoute/server/schema";
import { GOOGLE_SCOPES, PgBossJobQueue, getIntegrations, log, sealJson } from "@liferoute/server";
import { handle, requireOwner } from "@/server/http";
import { googleRedirectUri, STATE_COOKIE } from "@/server/google";

export const dynamic = "force-dynamic";

const MANAGED_CALENDAR = "LifeRoute";

/**
 * OAuth callback: stores the encrypted refresh token, ensures the separate managed "LifeRoute"
 * calendar exists (writes never touch other calendars) and queues the first read sync.
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    const url = new URL(request.url);
    const back = (status: string) => {
      const res = NextResponse.redirect(new URL(`/settings?google=${status}`, request.url));
      res.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/auth/google" });
      return res;
    };
    const state = url.searchParams.get("state") ?? "";
    const expected = request.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1] ?? "";
    if (
      !state ||
      state.length !== expected.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
    ) {
      return back("state-mismatch");
    }
    const code = url.searchParams.get("code");
    if (!code) return back("denied");

    const { calendar } = await getIntegrations();
    const db = getDb();
    try {
      const tokens = await calendar.exchangeCode(code, googleRedirectUri(request));
      const calendars = await calendar.listCalendars(tokens);
      // Reuse the calendar this app created on a previous connection; otherwise create a new one.
      // Never adopt a same-named calendar the owner made: calendar.app.created cannot write to it.
      const [current] = await db.select().from(connections).where(eq(connections.provider, "google"));
      const previous = current?.meta.managedCalendarId;
      const managed =
        previous && calendars.some((c) => c.id === previous)
          ? { id: previous }
          : await calendar.createCalendar(tokens, MANAGED_CALENDAR);
      const now = new Date();
      await db
        .update(connections)
        .set({
          status: "connected",
          secret: sealJson(tokens),
          scopes: [...GOOGLE_SCOPES],
          syncState: {},
          meta: { calendarIds: calendars.map((c) => c.id), managedCalendarId: managed.id },
          label: calendars.find((c) => c.primary)?.summary ?? "Google",
          lastError: null,
          updatedAt: now,
          version: sql`version + 1`,
        })
        .where(eq(connections.provider, "google"));
      await new PgBossJobQueue()
        .send(JOB_NAMES.googleSync, { reason: "connected" }, { singletonKey: "google" })
        .catch(() => false);
      return back("connected");
    } catch (error) {
      log.error("google.connect_failed", error);
      return back("failed");
    }
  });
}
