import {
  API_ROUTES,
  HTTP_STATUS_BY_ERROR,
  type ApiError,
  type ErrorCode,
  type VersionedResourceType,
} from "@liferoute/contracts";

/**
 * Domain errors carry a contract error code; the HTTP layer maps them to status codes
 * (HTTP_STATUS_BY_ERROR). Messages are Korean and never include balances, note bodies or secrets.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly nextAction?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }

  get status(): number {
    return HTTP_STATUS_BY_ERROR[this.code];
  }

  toBody(): ApiError {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
        ...(this.nextAction ? { nextAction: this.nextAction } : {}),
      },
    };
  }
}

export function notFound(what: string): DomainError {
  return new DomainError("NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`, undefined, "목록을 새로고침하세요.");
}

export function versionConflict(
  resourceType: VersionedResourceType,
  resourceId: string,
  expectedVersion: number,
  currentVersion: number,
  current: unknown,
): DomainError {
  return new DomainError(
    "VERSION_CONFLICT",
    "다른 곳에서 먼저 수정되었습니다.",
    { resourceType, resourceId, expectedVersion, currentVersion, current, refetchUrl: API_ROUTES.workspace },
    "최신 내용을 불러온 뒤 변경 사항을 다시 적용하세요.",
  );
}

export function invalidTransition(message: string): DomainError {
  return new DomainError("STATE_TRANSITION_INVALID", message);
}

export function validationFailed(issues: { path: (string | number)[] | string; message: string }[]): DomainError {
  return new DomainError(
    "VALIDATION_FAILED",
    "입력값을 확인하세요.",
    { issues: issues.map((i) => ({ path: typeof i.path === "string" ? i.path.split(".") : i.path, message: i.message })) },
  );
}

/** PostgreSQL unique violation on a named constraint/index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = findPgError(error);
  return !!e && e.code === "23505" && (constraint === undefined || e.constraint === constraint);
}

function findPgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const c = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) {
      return { code: c.code, constraint: typeof c.constraint === "string" ? c.constraint : undefined };
    }
    current = c.cause;
  }
  return null;
}

export function internalError(): DomainError {
  return new DomainError("INTERNAL", "서버 오류가 발생했습니다.", undefined, "잠시 후 다시 시도하세요.");
}
