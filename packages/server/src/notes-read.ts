import { and, desc, eq } from "drizzle-orm";
import type { NoteDetail, NoteRevision } from "@liferoute/contracts";
import { toMarkdown } from "@liferoute/core";
import type { Db } from "./db/client";
import { noteLinks, noteRevisions, notes } from "./db/schema";
import { notFound } from "./errors";
import { iso, toNote, toRevisionSummary } from "./mappers";

/** GET /api/v1/notes/:id — body, revision list and incoming links (review D-33). */
export async function loadNoteDetail(db: Db, noteId: string): Promise<NoteDetail> {
  const [row] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!row || row.deletedAt) throw notFound("노트");
  const [outgoing, revisions, incoming] = await Promise.all([
    db.select().from(noteLinks).where(eq(noteLinks.sourceNoteId, noteId)),
    db
      .select({
        id: noteRevisions.id,
        noteId: noteRevisions.noteId,
        version: noteRevisions.version,
        title: noteRevisions.title,
        savedAt: noteRevisions.savedAt,
      })
      .from(noteRevisions)
      .where(eq(noteRevisions.noteId, noteId))
      .orderBy(desc(noteRevisions.version))
      .limit(200),
    db
      .select()
      .from(noteLinks)
      .where(and(eq(noteLinks.targetType, "note"), eq(noteLinks.targetId, noteId))),
  ]);
  return { note: toNote(row, outgoing), revisions: revisions.map(toRevisionSummary), backlinks: incoming };
}

/** Incoming links for any target (project/goal/task pages show "이 항목을 언급한 노트"). */
export async function loadBacklinks(
  db: Db,
  targetType: "note" | "project" | "goal" | "task",
  targetId: string,
) {
  return db
    .select()
    .from(noteLinks)
    .where(and(eq(noteLinks.targetType, targetType), eq(noteLinks.targetId, targetId)));
}

export async function loadRevision(db: Db, noteId: string, revisionId: string): Promise<NoteRevision> {
  const [row] = await db
    .select()
    .from(noteRevisions)
    .where(and(eq(noteRevisions.id, revisionId), eq(noteRevisions.noteId, noteId)));
  if (!row) throw notFound("이전 버전");
  return {
    id: row.id,
    noteId: row.noteId,
    version: row.version,
    title: row.title,
    document: row.document,
    text: row.text,
    savedAt: iso(row.savedAt),
  };
}

/** Portable Markdown copy generated on request only; nothing is written to disk (review D-29). */
export async function noteMarkdown(db: Db, noteId: string): Promise<{ filename: string; markdown: string }> {
  const [row] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!row || row.deletedAt) throw notFound("노트");
  const markdown = toMarkdown(row.title, row.document, {
    attachmentUrl: (id) => `/api/v1/attachments/${id}`,
  });
  const safe =
    (row.title || "note")
      .replace(/[\\/:*?"<>|\n\r]+/g, " ")
      .trim()
      .slice(0, 80) || "note";
  return { filename: `${safe}.md`, markdown };
}
