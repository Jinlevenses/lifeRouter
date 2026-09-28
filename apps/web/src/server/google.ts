import "server-only";

export const STATE_COOKIE = "liferoute_gstate";

/** The redirect URI registered in Google Cloud must be exactly this (BETTER_AUTH_URL-based). */
export function googleRedirectUri(request: Request): string {
  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  return new URL("/api/v1/auth/google/callback", base).toString();
}
