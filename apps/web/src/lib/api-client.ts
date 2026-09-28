"use client";

import type { ApiError, Command, CommandResult, WorkspaceData } from "@liferoute/contracts";

/**
 * Browser client for /api/v1 (docs/04_api). Every write carries an idempotency key so a
 * retried request never applies twice; 409 conflicts surface as ConflictError so the UI can
 * offer "최신 내용 보기/다시 적용" instead of silently overwriting (docs/05_web).
 */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }
  get isConflict() {
    return this.status === 409;
  }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    if (response.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiRequestError(
      response.status,
      (body as ApiError | null) ?? { code: "internal", message: `HTTP ${response.status}` },
    );
  }
  return body as T;
}

export async function fetchWorkspace(signal?: AbortSignal): Promise<WorkspaceData> {
  const response = await fetch("/api/v1/workspace", { cache: "no-store", signal });
  return parse<WorkspaceData>(response);
}

export async function postCommand<C extends Command>(
  command: Omit<C, "idempotencyKey"> & { idempotencyKey?: string },
): Promise<CommandResult> {
  const body = { ...command, idempotencyKey: command.idempotencyKey ?? newIdempotencyKey() };
  const response = await fetch("/api/v1/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<CommandResult>(response);
}
