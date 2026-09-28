import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { IdSchema } from "@liferoute/contracts";
import { getOwnerSession } from "@liferoute/server/auth";
import { getDb } from "@liferoute/server/db";
import { DomainError, loadNoteDetail } from "@liferoute/server";
import { NoteEditor } from "@/components/notes/note-editor";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  // Layouts and pages render in parallel, so this page checks the session itself before reading data.
  if (!(await getOwnerSession(await headers()))) redirect("/login");
  const { noteId } = await params;
  if (!IdSchema.safeParse(noteId).success) notFound();
  try {
    const detail = await loadNoteDetail(getDb(), noteId);
    return <NoteEditor key={detail.note.id} initial={detail} />;
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
