"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, ListTodo, NotebookPen, Receipt } from "lucide-react";
import clsx from "clsx";
import { Sheet } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/fields";
import { useWorkspace } from "@/lib/workspace";
import { useToast } from "@/components/ui/toast";
import { ApiRequestError, uploadCapture } from "@/lib/api-client";

type Mode = "inbox" | "task" | "note";

/**
 * Capture-first action (docs/01_product): one text box that files into Inbox by default,
 * or directly as a task/note; photos and receipts upload into Inbox as drafts.
 */
export function QuickCapture({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, refresh } = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("inbox");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileKind, setFileKind] = useState<"image" | "receipt">("receipt");

  const trimmed = text.trim();
  const isUrl = /^https?:\/\/\S+$/i.test(trimmed);

  async function submit() {
    if (!trimmed) return;
    setSaving(true);
    let ok = false;
    if (mode === "task") {
      ok = !!(await run(
        {
          type: "task.create",
          payload: {
            title: trimmed.split("\n")[0]!.slice(0, 200),
            description: trimmed.split("\n").slice(1).join("\n"),
          },
        },
        { success: "할 일에 추가했습니다." },
      ));
    } else if (mode === "note") {
      const [first = "", ...rest] = trimmed.split("\n");
      ok = !!(await run(
        {
          type: "note.create",
          payload: {
            title: first.slice(0, 300),
            document: {
              type: "doc",
              content: (rest.length ? rest : [""]).map((line) =>
                line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
              ),
            },
          },
        },
        { success: "노트를 만들었습니다." },
      ));
    } else {
      ok = !!(await run(
        {
          type: "inbox.create",
          payload: isUrl ? { kind: "url", url: trimmed } : { kind: "text", text: trimmed },
        },
        { success: "Inbox에 담았습니다." },
      ));
    }
    setSaving(false);
    if (ok) {
      setText("");
      onOpenChange(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.set("kind", fileKind);
      form.set("file", file);
      await uploadCapture(form);
      await refresh();
      toast.show({
        tone: "success",
        title: fileKind === "receipt" ? "영수증 초안을 만들었습니다." : "사진을 Inbox에 담았습니다.",
        description: fileKind === "receipt" ? "Inbox에서 금액·가게·날짜를 확인해 확정하세요." : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      toast.show({
        tone: "danger",
        title: error instanceof ApiRequestError ? error.message : "업로드하지 못했습니다.",
      });
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const modes: { id: Mode; label: string; icon: typeof ListTodo }[] = [
    { id: "inbox", label: "Inbox", icon: isUrl ? Link2 : ListTodo },
    { id: "task", label: "할 일", icon: ListTodo },
    { id: "note", label: "노트", icon: NotebookPen },
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="빠른 캡처"
      description="떠오른 것을 먼저 적고, 정리는 나중에 하세요."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" onClick={submit} disabled={!trimmed || saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextArea
          autoFocus
          aria-label="캡처 내용"
          placeholder="할 일, 메모, 링크…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          rows={4}
        />
        <div role="radiogroup" aria-label="저장 위치" className="flex gap-1.5">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold",
                mode === m.id
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-line text-ink-muted hover:bg-canvas",
              )}
            >
              <m.icon className="size-3.5" aria-hidden />
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            size="sm"
            onClick={() => {
              setFileKind("receipt");
              fileRef.current?.click();
            }}
            disabled={saving}
          >
            <Receipt className="size-4" aria-hidden /> 영수증 사진
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setFileKind("image");
              fileRef.current?.click();
            }}
            disabled={saving}
          >
            <ImagePlus className="size-4" aria-hidden /> 사진
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
