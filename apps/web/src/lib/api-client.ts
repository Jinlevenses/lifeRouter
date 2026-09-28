"use client";

import type {
  ApiError,
  CommandInput,
  CommandOk,
  CommandResultMap,
  NoteDetail,
  NoteRevision,
  WorkspaceData,
} from "@liferoute/contracts";

/**
 * Browser client for /api/v1 (docs/04_api). Each attempt gets a fresh idempotency key and a
 * network retry reuses it, so a retried request never applies twice (review D-09). 409s surface as
 * ApiRequestError so the UI can offer "최신 내용 보기/다시 적용" instead of overwriting (docs/05_web).
 */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error.message);
    this.name = "ApiRequestError";
  }
  get code() {
    return this.body.error.code;
  }
  get nextAction() {
    return this.body.error.nextAction;
  }
  get details() {
    return this.body.error.details;
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    const fallback: ApiError = {
      ok: false,
      error: { code: "INTERNAL", message: `서버 응답 오류 (${response.status})` },
    };
    throw new ApiRequestError(
      response.status,
      (body as ApiError | null)?.error ? (body as ApiError) : fallback,
    );
  }
  return body as T;
}

export async function fetchWorkspace(signal?: AbortSignal): Promise<WorkspaceData> {
  return parse<WorkspaceData>(await fetch("/api/v1/workspace", { cache: "no-store", signal }));
}

export async function fetchNote(noteId: string): Promise<NoteDetail> {
  return parse<NoteDetail>(await fetch(`/api/v1/notes/${noteId}`, { cache: "no-store" }));
}

export async function fetchRevision(noteId: string, revisionId: string): Promise<NoteRevision> {
  return parse<NoteRevision>(
    await fetch(`/api/v1/notes/${noteId}/revisions/${revisionId}`, { cache: "no-store" }),
  );
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command as the UI sends it; the client adds the idempotency key. */
export type CommandRequestBody = DistributiveOmit<CommandInput, "idempotencyKey">;

export async function postCommand<C extends CommandRequestBody>(
  command: C,
): Promise<CommandResultMap[C["type"]]> {
  type T = C["type"];
  const body = JSON.stringify({ ...command, idempotencyKey: crypto.randomUUID() });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("/api/v1/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const ok = await parse<CommandOk<T>>(response);
      return ok.result as CommandResultMap[T];
    } catch (error) {
      // Only network failures are retried (same key → no double apply); API errors are final.
      if (error instanceof ApiRequestError) throw error;
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function uploadCapture(form: FormData) {
  return parse<import("@liferoute/contracts").CaptureResponse>(
    await fetch("/api/v1/capture", { method: "POST", body: form }),
  );
}

export async function uploadAttachment(file: File) {
  const form = new FormData();
  form.set("file", file);
  return parse<import("@liferoute/contracts").AttachmentUploadResponse>(
    await fetch("/api/v1/attachments", { method: "POST", body: form }),
  );
}
