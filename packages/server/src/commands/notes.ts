import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { CommandPayload, CommandResultMap, DocumentNode, NoteLink } from "@liferoute/contracts";
import { deriveText, emptyDocument, extractLinks, normalizeTags, validateDocument } from "@liferoute/core";
import { goals, noteLinks, noteRevisions, notes, projects } from "../db/schema";
import { DomainError, notFound, validationFailed } from "../errors";
import { toNote, toNoteSummary, toRevisionSummary } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

function checkDocument(doc: DocumentNode) {
  const issues = validateDocument(doc);
  if (issues.length > 0) throw validationFailed(issues);
}

async function checkRefs(ctx: CommandContext, projectId: string | null, goalId: string | null) {
  if (projectId) {
    const [row] = await ctx.tx
      .select({ d: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!row || row.d) throw notFound("프로젝트");
  }
  if (goalId) {
    const [row] = await ctx.tx.select({ d: goals.deletedAt }).from(goals).where(eq(goals.id, goalId));
    if (!row || row.d) throw notFound("목표");
  }
}

/** Replaces the outgoing link rows of a note with those found in its document (review D-28). */
async function replaceLinks(ctx: CommandContext, noteId: string, doc: DocumentNode): Promise<NoteLink[]> {
  const links = extractLinks(doc, noteId);
  await ctx.tx.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId));
  if (links.length > 0) await ctx.tx.insert(noteLinks).values(links);
  return links;
}

async function lockNote(ctx: CommandContext, noteId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(notes).where(eq(notes.id, noteId)).for("update");
  const links = row ? await ctx.tx.select().from(noteLinks).where(eq(noteLinks.sourceNoteId, noteId)) : [];
  return assertVersion(row, expectedVersion, "note", noteId, (r) => toNote(r, links), "노트");
}

export async function noteCreate(ctx: CommandContext, p: P<"note.create">): R<"note.create"> {
  const id = p.id ?? randomUUID();
  const document = p.document ?? emptyDocument();
  checkDocument(document);
  await checkRefs(ctx, p.projectId, p.goalId);
  const [existing] = await ctx.tx.select({ id: notes.id }).from(notes).where(eq(notes.id, id));
  if (existing) throw new DomainError("VALIDATION_FAILED", "이미 사용 중인 id입니다.");
  const [row] = await ctx.tx
    .insert(notes)
    .values({
      id,
      title: p.title.trim(),
      document,
      text: deriveText(document),
      tags: normalizeTags(p.tags),
      projectId: p.projectId,
      goalId: p.goalId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  const links = await replaceLinks(ctx, id, document);
  return { note: toNote(row!, links) };
}

/** Full save with expected version; the previous content is kept as a NoteRevision (review D-30). */
async function saveContent(
  ctx: CommandContext,
  current: typeof notes.$inferSelect,
  next: {
    title: string;
    document: DocumentNode;
    tags: string[];
    projectId: string | null;
    goalId: string | null;
  },
) {
  const [revision] = await ctx.tx
    .insert(noteRevisions)
    .values({
      id: randomUUID(),
      noteId: current.id,
      version: current.version,
      title: current.title,
      document: current.document,
      text: current.text,
      savedAt: ctx.now,
    })
    .returning();
  const [row] = await ctx.tx
    .update(notes)
    .set({
      title: next.title.trim(),
      document: next.document,
      text: deriveText(next.document),
      tags: normalizeTags(next.tags),
      projectId: next.projectId,
      goalId: next.goalId,
      updatedAt: ctx.now,
      version: sql`version + 1`,
    })
    .where(eq(notes.id, current.id))
    .returning();
  const links = await replaceLinks(ctx, current.id, next.document);
  return { note: toNote(row!, links), revision: toRevisionSummary(revision!) };
}

export async function noteSave(ctx: CommandContext, p: P<"note.save">): R<"note.save"> {
  checkDocument(p.document);
  const current = await lockNote(ctx, p.noteId, p.expectedVersion);
  await checkRefs(ctx, p.projectId, p.goalId);
  return saveContent(ctx, current, p);
}

export async function noteDelete(ctx: CommandContext, p: P<"note.delete">): R<"note.delete"> {
  await lockNote(ctx, p.noteId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(notes)
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, version: sql`version + 1` })
    .where(eq(notes.id, p.noteId))
    .returning();
  // A deleted note no longer contributes backlinks to anything.
  await ctx.tx.delete(noteLinks).where(eq(noteLinks.sourceNoteId, p.noteId));
  return { note: toNoteSummary(row!, 0, 0) };
}

export async function noteRestoreRevision(
  ctx: CommandContext,
  p: P<"note.restoreRevision">,
): R<"note.restoreRevision"> {
  const current = await lockNote(ctx, p.noteId, p.expectedVersion);
  const [revision] = await ctx.tx
    .select()
    .from(noteRevisions)
    .where(and(eq(noteRevisions.id, p.revisionId), eq(noteRevisions.noteId, p.noteId)));
  if (!revision) throw notFound("이전 버전");
  return saveContent(ctx, current, {
    title: revision.title,
    document: revision.document,
    tags: current.tags,
    projectId: current.projectId,
    goalId: current.goalId,
  });
}
