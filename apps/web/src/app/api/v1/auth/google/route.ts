import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getIntegrations } from "@liferoute/server";
import { handle, requireOwner } from "@/server/http";
import { googleRedirectUri, STATE_COOKIE } from "@/server/google";

export const dynamic = "force-dynamic";

/** GET /api/v1/auth/google — starts OAuth for the owner only (FR-008). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    const integrations = await getIntegrations();
    if (!integrations.calendar.available) {
      return NextResponse.redirect(new URL("/settings?google=not-configured", request.url));
    }
    const state = randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(integrations.calendar.authUrl(state, googleRedirectUri(request)));
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/api/v1/auth/google",
      maxAge: 600,
    });
    return response;
  });
}
