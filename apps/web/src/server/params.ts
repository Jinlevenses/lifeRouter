import "server-only";
import { notFound } from "@liferoute/server";

export function notFoundId(what: string) {
  return notFound(what);
}

/** RFC 6266 filename with a UTF-8 variant for Korean names. */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
