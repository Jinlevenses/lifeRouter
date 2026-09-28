"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Download,
  Heading2,
  History,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import type {
  DocumentNode,
  LinkTargetType,
  NoteDetail,
  NoteRevision,
  VersionConflictDetails,
} from "@liferoute/contracts";
import { normalizeTags } from "@liferoute/core";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Sheet } from "@/components/ui/dialog";
import { Select, TextInput } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { ApiRequestError, fetchNote, fetchRevision, postCommand, uploadAttachment } from "@/lib/api-client";
import { useWorkspace } from "@/lib/workspace";
import { instantLabel } from "@/lib/dates";
import { noteExtensions } from "./extensions";

type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * Note editor (FR-006, docs/05_web): full saves with expectedVersion, autosave after a pause,
 * explicit conflict resolution on 409 (never silent overwrite), revisions, backlinks, Markdown export.
 */
export function NoteEditor({ initial }: { initial: NoteDetail }) {
  const { ws, refresh, run } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState(initial);
  const [title, setTitle] = useState(initial.note.title);
  const [tags, setTags] = useState(initial.note.tags.join(", "));
  const [projectId, setProjectId] = useState(initial.note.projectId ?? "");
  const [goalId, setGoalId] = useState(initial.note.goalId ?? "");
  const [state, setState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<VersionConflictDetails | null>(null);
  const [linkPicker, setLinkPicker] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const version = useRef(initial.note.version);
  const editsRef = useRef(0);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: noteExtensions(),
    content: initial.note.document,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-note min-h-[40vh] focus:outline-none",
        "aria-label": "노트 본문",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: () => markDirty(),
  });

  const save = useCallback(
    async (overrideVersion?: number) => {
      if (!editor) return;
      if (timer.current) window.clearTimeout(timer.current);
      const editsAtStart = editsRef.current;
      stateRef.current = "saving";
      setState("saving");
      try {
        const result = await postCommand({
          type: "note.save",
          payload: {
            noteId: detail.note.id,
            expectedVersion: overrideVersion ?? version.current,
            title: title.trim(),
            document: editor.getJSON() as DocumentNode,
            tags: normalizeTags(
              tags
                .split(/[,\s]+/)
                .map((t) => t.replace(/[#,]/g, ""))
                .filter(Boolean),
            ).slice(0, 20),
            projectId: projectId || null,
            goalId: goalId || null,
          },
        });
        version.current = result.note.version;
        setDetail((d) => ({ ...d, note: result.note, revisions: [result.revision, ...d.revisions] }));
        setConflict(null);
        if (editsRef.current !== editsAtStart) {
          // Typing continued while saving: keep it dirty and save again shortly.
          stateRef.current = "dirty";
          setState("dirty");
          timer.current = window.setTimeout(() => void saveRef.current(), 800);
        } else {
          stateRef.current = "saved";
          setState("saved");
        }
        void refresh();
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "VERSION_CONFLICT") {
          setConflict(error.details as VersionConflictDetails);
          stateRef.current = "conflict";
          setState("conflict");
        } else {
          stateRef.current = "error";
          setState("error");
          toast.show({
            tone: "danger",
            title: error instanceof ApiRequestError ? error.message : "저장하지 못했습니다.",
            description: "내용은 화면에 남아 있습니다. 다시 저장해 보세요.",
          });
        }
      }
    },
    [editor, detail.note.id, title, tags, projectId, goalId, refresh, toast],
  );

  const saveRef = useRef(save);
  const stateRef = useRef(state);
  useEffect(() => {
    saveRef.current = save;
    stateRef.current = state;
  }, [save, state]);

  const markDirty = useCallback(() => {
    editsRef.current += 1;
    if (stateRef.current === "conflict") return;
    stateRef.current = "dirty";
    setState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    // Autosave after a pause; never while a conflict waits for the owner's decision.
    timer.current = window.setTimeout(() => {
      if (stateRef.current === "dirty") void saveRef.current();
    }, 1500);
  }, []);

  // Warn before leaving with unsaved changes; Cmd/Ctrl+S saves immediately.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || state === "conflict") e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", onKey);
    };
  }, [state]);

  // Clicking an inline link opens its target.
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const open = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-note-link]");
      if (!el) return;
      if (e instanceof KeyboardEvent && e.key !== "Enter") return;
      e.preventDefault();
      const type = el.dataset.targetType as LinkTargetType;
      const id = el.dataset.targetId;
      router.push(
        type === "note" ? `/notes/${id}` : type === "task" ? "/plans?tab=tasks" : "/plans?tab=projects",
      );
    };
    dom.addEventListener("click", open);
    dom.addEventListener("keydown", open);
    return () => {
      dom.removeEventListener("click", open);
      dom.removeEventListener("keydown", open);
    };
  }, [editor, router]);

  async function loadLatest() {
    const latest = await fetchNote(detail.note.id);
    setDetail(latest);
    version.current = latest.note.version;
    setTitle(latest.note.title);
    setTags(latest.note.tags.join(", "));
    setProjectId(latest.note.projectId ?? "");
    setGoalId(latest.note.goalId ?? "");
    editor?.commands.setContent(latest.note.document, { emitUpdate: false });
    setConflict(null);
    stateRef.current = "saved";
    setState("saved");
  }

  async function addImage(file: File | undefined) {
    if (!file || !editor) return;
    try {
      const { attachment } = await uploadAttachment(file);
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { attachmentId: attachment.id, alt: file.name } })
        .run();
    } catch (error) {
      toast.show({
        tone: "danger",
        title: error instanceof ApiRequestError ? error.message : "이미지를 올리지 못했습니다.",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("이 노트를 삭제할까요?")) return;
    const ok = await run({
      type: "note.delete",
      payload: { noteId: detail.note.id, expectedVersion: version.current },
    });
    if (ok) router.push("/notes");
  }

  const backlinkTitles = detail.backlinks.map((l) => ({
    id: l.sourceNoteId,
    title: ws.notes.find((n) => n.id === l.sourceNoteId)?.title || "제목 없음",
  }));
  const mentions = [
    ...(detail.note.projectId
      ? [
          {
            href: "/plans?tab=projects",
            label: `프로젝트 · ${ws.projects.find((p) => p.id === detail.note.projectId)?.title ?? ""}`,
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/notes" className="text-sm font-semibold text-ink-muted hover:text-ink">
            ← 노트
          </Link>
          <span className="ml-auto text-[13px] text-ink-muted" role="status" aria-live="polite">
            {state === "saved"
              ? "저장됨"
              : state === "dirty"
                ? "변경됨…"
                : state === "saving"
                  ? "저장 중…"
                  : state === "conflict"
                    ? "충돌"
                    : "저장 실패"}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => save()}
            disabled={state === "saving" || state === "conflict"}
          >
            저장
          </Button>
        </div>

        {conflict ? (
          <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-[13px]">
            <p className="font-semibold text-warn">
              다른 곳에서 먼저 저장된 버전(v{conflict.currentVersion})이 있습니다.
            </p>
            <p className="mt-0.5 text-ink-muted">
              지금 화면의 내용은 아직 저장되지 않았습니다. 어느 쪽을 남길지 고르세요.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={loadLatest}>
                최신 버전 불러오기 (내 변경 버림)
              </Button>
              <Button size="sm" variant="primary" onClick={() => save(conflict.currentVersion)}>
                내 변경으로 저장 (이전 것은 기록에 남음)
              </Button>
            </div>
          </div>
        ) : null}

        <Card className="!p-0">
          <div className="border-b border-line p-4 sm:p-5">
            <TextInput
              aria-label="제목"
              placeholder="제목"
              value={title}
              maxLength={300}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              className="!border-0 !p-0 !text-[22px] !font-bold focus-visible:!outline-none"
            />
          </div>
          <Toolbar
            editor={editor}
            onLink={() => setLinkPicker(true)}
            onImage={() => fileRef.current?.click()}
          />
          <div className="px-4 pb-6 pt-3 sm:px-5">
            <EditorContent editor={editor} />
          </div>
        </Card>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void addImage(e.target.files?.[0])}
        />
      </div>

      <aside className="space-y-3" aria-label="노트 정보">
        <Card>
          <CardHeader title="정보" as="h2" />
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="label">태그 (쉼표로 구분)</span>
              <TextInput
                value={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                  markDirty();
                }}
                placeholder="예: 가계부, 여행"
              />
            </label>
            <label className="block">
              <span className="label">프로젝트</span>
              <Select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  markDirty();
                }}
              >
                <option value="">없음</option>
                {ws.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="label">목표</span>
              <Select
                value={goalId}
                onChange={(e) => {
                  setGoalId(e.target.value);
                  markDirty();
                }}
              >
                <option value="">없음</option>
                {ws.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </Card>
        <Card>
          <CardHeader title="이 노트를 가리키는 노트" description={`${backlinkTitles.length}개`} as="h2" />
          {backlinkTitles.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              아직 없습니다. 다른 노트에서 ‘링크’로 이 노트를 연결해 보세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {backlinkTitles.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/notes/${b.id}`}
                    className="text-sm font-medium text-accent-strong hover:underline"
                  >
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {detail.note.links.length ? (
            <p className="mt-2 text-[12px] text-ink-muted">이 노트의 링크 {detail.note.links.length}개</p>
          ) : null}
          {mentions.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="mt-1 block text-[12px] text-ink-muted hover:underline"
            >
              {m.label}
            </Link>
          ))}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="size-4" aria-hidden /> 이전 버전 {detail.revisions.length}
          </Button>
          <a
            href={`/api/v1/notes/${detail.note.id}/export.md`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-2.5 text-[13px] font-semibold hover:bg-canvas"
          >
            <Download className="size-4" aria-hidden /> Markdown
          </a>
          <Button size="sm" variant="ghost" className="text-danger" onClick={remove}>
            <Trash2 className="size-4" aria-hidden /> 삭제
          </Button>
        </div>
        <p className="text-[12px] text-ink-subtle">
          v{detail.note.version} · {instantLabel(detail.note.updatedAt, ws.today)} 수정
        </p>
      </aside>

      <LinkPicker
        open={linkPicker}
        onOpenChange={setLinkPicker}
        currentId={detail.note.id}
        onPick={(targetType, targetId, label) => {
          editor
            ?.chain()
            .focus()
            .insertContent([
              { type: "noteLink", attrs: { targetType, targetId, label } },
              { type: "text", text: " " },
            ])
            .run();
          setLinkPicker(false);
        }}
      />
      <RevisionSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        detail={detail}
        onRestore={async (revisionId) => {
          try {
            const result = await postCommand({
              type: "note.restoreRevision",
              payload: { noteId: detail.note.id, expectedVersion: version.current, revisionId },
            });
            version.current = result.note.version;
            editor?.commands.setContent(result.note.document, { emitUpdate: false });
            setTitle(result.note.title);
            setDetail((d) => ({ ...d, note: result.note, revisions: [result.revision, ...d.revisions] }));
            setState("saved");
            setHistoryOpen(false);
            toast.show({
              tone: "success",
              title: "이전 버전으로 되돌렸습니다.",
              description: "되돌리기 전 내용도 기록에 남아 있습니다.",
            });
            void refresh();
          } catch (error) {
            toast.show({
              tone: "danger",
              title: error instanceof ApiRequestError ? error.message : "복원하지 못했습니다.",
            });
          }
        }}
      />
    </div>
  );
}

function Toolbar({
  editor,
  onLink,
  onImage,
}: {
  editor: Editor | null;
  onLink: () => void;
  onImage: () => void;
}) {
  if (!editor) return <div className="h-11 border-b border-line" />;
  const item = (label: string, icon: React.ReactNode, active: boolean, action: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={action}
      className={clsx(
        "flex size-9 items-center justify-center rounded-lg",
        active ? "bg-accent-soft text-accent-strong" : "text-ink-muted hover:bg-canvas hover:text-ink",
      )}
    >
      {icon}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="서식" className="flex flex-wrap gap-0.5 border-b border-line px-2 py-1">
      {item("제목", <Heading2 className="size-4" />, editor.isActive("heading", { level: 2 }), () =>
        c().toggleHeading({ level: 2 }).run(),
      )}
      {item("굵게", <Bold className="size-4" />, editor.isActive("bold"), () => c().toggleBold().run())}
      {item("기울임", <Italic className="size-4" />, editor.isActive("italic"), () =>
        c().toggleItalic().run(),
      )}
      {item("취소선", <Strikethrough className="size-4" />, editor.isActive("strike"), () =>
        c().toggleStrike().run(),
      )}
      {item("코드", <Code className="size-4" />, editor.isActive("code"), () => c().toggleCode().run())}
      {item("글머리 목록", <List className="size-4" />, editor.isActive("bulletList"), () =>
        c().toggleBulletList().run(),
      )}
      {item("번호 목록", <ListOrdered className="size-4" />, editor.isActive("orderedList"), () =>
        c().toggleOrderedList().run(),
      )}
      {item("체크리스트", <ListChecks className="size-4" />, editor.isActive("taskList"), () =>
        c().toggleTaskList().run(),
      )}
      {item("인용", <Quote className="size-4" />, editor.isActive("blockquote"), () =>
        c().toggleBlockquote().run(),
      )}
      <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
      {item("노트·프로젝트 링크", <Link2 className="size-4" />, false, onLink)}
      {item("이미지", <ImagePlus className="size-4" />, false, onImage)}
    </div>
  );
}

function LinkPicker({
  open,
  onOpenChange,
  currentId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentId: string;
  onPick: (type: LinkTargetType, id: string, label: string) => void;
}) {
  const { ws } = useWorkspace();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const options: { type: LinkTargetType; id: string; label: string; kind: string }[] = [
    ...ws.notes
      .filter((n) => n.id !== currentId && match(n.title))
      .map((n) => ({ type: "note" as const, id: n.id, label: n.title || "제목 없음", kind: "노트" })),
    ...ws.projects
      .filter((p) => match(p.title))
      .map((p) => ({ type: "project" as const, id: p.id, label: p.title, kind: "프로젝트" })),
    ...ws.goals
      .filter((g) => match(g.title))
      .map((g) => ({ type: "goal" as const, id: g.id, label: g.title, kind: "목표" })),
    ...ws.tasks
      .filter((t) => t.status === "open" && match(t.title))
      .map((t) => ({ type: "task" as const, id: t.id, label: t.title, kind: "할 일" })),
  ].slice(0, 50);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="링크 넣기"
      description="연결한 곳의 ‘가리키는 노트’에 이 노트가 나타납니다."
    >
      <TextInput
        autoFocus
        type="search"
        aria-label="링크 대상 검색"
        placeholder="검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <ul className="divide-y divide-line">
        {options.map((o) => (
          <li key={`${o.type}:${o.id}`}>
            <button
              type="button"
              onClick={() => onPick(o.type, o.id, o.label)}
              className="flex w-full items-center gap-2 py-2.5 text-left hover:text-accent-strong"
            >
              <Badge>{o.kind}</Badge>
              <span className="truncate text-[15px]">{o.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function RevisionSheet({
  open,
  onOpenChange,
  detail,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: NoteDetail;
  onRestore: (revisionId: string) => void;
}) {
  const { ws } = useWorkspace();
  const [preview, setPreview] = useState<NoteRevision | null>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="이전 버전"
      description="저장할 때마다 직전 내용이 보관됩니다."
      wide
    >
      {detail.revisions.length === 0 ? (
        <p className="text-sm text-ink-muted">아직 이전 버전이 없습니다.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {detail.revisions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={async () => setPreview(await fetchRevision(detail.note.id, r.id))}
                  className={clsx(
                    "w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-canvas",
                    preview?.id === r.id && "bg-accent-soft",
                  )}
                >
                  <span className="font-semibold">v{r.version}</span> · {instantLabel(r.savedAt, ws.today)}
                  <span className="block truncate text-ink-muted">{r.title || "제목 없음"}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 rounded-xl bg-canvas p-3">
            {preview ? (
              <>
                <p className="font-bold">{preview.title || "제목 없음"}</p>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-[13px] text-ink-muted">
                  {preview.text || "(내용 없음)"}
                </pre>
                <Button size="sm" variant="primary" className="mt-3" onClick={() => onRestore(preview.id)}>
                  이 버전으로 되돌리기
                </Button>
              </>
            ) : (
              <p className="text-[13px] text-ink-muted">왼쪽에서 버전을 고르면 내용을 볼 수 있습니다.</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
