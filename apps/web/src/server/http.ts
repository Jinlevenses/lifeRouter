import "server-only";
import { NextResponse } from "next/server";
import { getOwnerSession, trustedOrigins } from "@liferoute/server/auth";
import { DomainError, LIMITS, internalError, log, rateLimit } from "@liferoute/server";

/**
 * Route-handler plumbing: owner session, same-origin check for cookie-authenticated writes
 * (CSRF), per-process rate limits and uniform error bodies (docs/04_api, docs/13_security).
 */
export async function requireOwner(request: Request) {
  const session = await getOwnerSession(request.headers);
  if (!session)
    throw new DomainError("UNAUTHORIZED", "로그인이 필요합니다.", undefined, "다시 로그인하세요.");
  return session;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const allowed = new Set([...trustedOrigins(), new URL(request.url).origin]);
  if (origin ? allowed.has(origin) : fetchSite === "same-origin") return;
  throw new DomainError("FORBIDDEN", "허용되지 않은 출처의 요청입니다.");
}

export function limit(bucket: keyof typeof LIMITS, key: string) {
  const result = rateLimit(`${bucket}:${key}`, LIMITS[bucket]);
  if (!result.ok) {
    throw new DomainError(
      "RATE_LIMITED",
      "요청이 너무 많습니다.",
      { retryAfterSec: result.retryAfterSec },
      "잠시 후 다시 시도하세요.",
    );
  }
}

export function errorResponse(error: unknown): NextResponse {
  const domain = error instanceof DomainError ? error : null;
  if (!domain) log.error("route.failed", error);
  const e = domain ?? internalError();
  return NextResponse.json(e.toBody(), { status: e.status, headers: { "cache-control": "no-store" } });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
