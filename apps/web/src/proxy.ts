import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth redirect only (Next 16 Proxy). Real authorization happens in every
 * route handler and server component via Better Auth session lookup.
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: "liferoute" });
  if (!cookie) {
    const url = new URL("/login", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: API routes answer 401 JSON themselves; static assets and the login page are public.
  matcher: ["/((?!api/|_next/|login|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)"],
};
