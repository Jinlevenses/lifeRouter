"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Link2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, PageHeader } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay, seoulParts } from "@/lib/dates";

/** 노트 목록 (FR-006): search by title/excerpt, filter by tag, backlink counts. */
export default function NotesPage() {
  const { ws, run } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of ws.notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [ws.notes]);
  const q = query.trim().toLowerCase();
  const notes = ws.notes.filter(
    (n) =>
      (!tag || n.tags.includes(tag)) &&
      (!q || n.title.toLowerCase().includes(q) || n.excerpt.toLowerCase().includes(q)),
  );

  async function create() {
    const result = await run({ type: "note.create", payload: { title: "" } });
    if (result) router.push(`/notes/${result.note.id}`);
  }

  return (
    <>
      <PageHeader
        title="노트"
        description="생각과 기록을 적고 다른 노트·프로젝트·목표·할 일과 연결하세요."
        action={
          <>
            <Link href="/collections" className="text-sm font-semibold text-primary hover:underline">
              컬렉션
            </Link>
            <Button onClick={create}>
              <Plus className="size-4" aria-hidden /> 새 노트
            </Button>
          </>
        }
      />
      <div className="mb-4 space-y-2">
        <SearchInput
          aria-label="노트 검색"
          placeholder="제목·내용 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="태그로 거르기">
            {tags.map(([t, count]) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? null : t)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[13px] font-semibold",
                  tag === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted",
                )}
              >
                #{t} <span className="font-normal opacity-70">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {notes.length === 0 ? (
        <EmptyState
          title={ws.notes.length ? "검색 결과가 없습니다." : "아직 노트가 없습니다."}
          action={!ws.notes.length ? <Button onClick={create}>첫 노트 쓰기</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((n) => {
            const updated = seoulParts(n.updatedAt);
            return (
              <li key={n.id}>
                <Link
                  href={`/notes/${n.id}`}
                  className="block h-full rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <p className="truncate text-[15px] font-bold">{n.title || "제목 없음"}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                    {n.excerpt || "내용 없음"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span>
                      {relativeDay(updated.date, ws.today)} {updated.time}
                    </span>
                    {n.backlinkCount ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Link2 className="size-3" aria-hidden /> {n.backlinkCount}
                      </span>
                    ) : null}
                    {n.tags.slice(0, 3).map((t) => (
                      <Badge key={t}>#{t}</Badge>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
