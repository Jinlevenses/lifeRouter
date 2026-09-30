"use client";

import { useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import type { Task } from "@liferoute/contracts";
import { addDays } from "@liferoute/core";
import { Card, CardHeader, EmptyState } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/segmented";
import { SearchInput, Select } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";
import { TaskRow } from "./task-row";
import { TaskEditor } from "./task-editor";

type Filter = "open" | "done";

export function TasksTab() {
  const { ws, run } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const edit = (t: Task | null) => {
    setEditing(t);
    setOpen(true);
  };

  const tasks = useMemo(
    () =>
      ws.tasks
        .filter((t) => t.deletedAt === null)
        .filter((t) => (filter === "open" ? t.status === "open" : t.status !== "open"))
        .filter((t) => !projectId || t.projectId === projectId)
        .filter((t) => !query || t.title.toLowerCase().includes(query.toLowerCase())),
    [ws.tasks, filter, projectId, query],
  );

  const groups = useMemo(() => {
    if (filter === "done") {
      return [
        {
          id: "done",
          title: "완료·취소 (최근 60일)",
          items: [...tasks].sort((a, b) =>
            (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
          ),
        },
      ];
    }
    const week = addDays(ws.today, 7);
    const by = (pred: (t: Task) => boolean) =>
      tasks
        .filter(pred)
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.sortOrder - b.sortOrder);
    return [
      { id: "overdue", title: "기한 지남", items: by((t) => !!t.dueDate && t.dueDate < ws.today) },
      { id: "today", title: "오늘 마감", items: by((t) => t.dueDate === ws.today) },
      {
        id: "week",
        title: "7일 안",
        items: by((t) => !!t.dueDate && t.dueDate > ws.today && t.dueDate <= week),
      },
      { id: "later", title: "나중", items: by((t) => !!t.dueDate && t.dueDate > week) },
      { id: "none", title: "마감 없음", items: by((t) => !t.dueDate) },
    ].filter((g) => g.items.length > 0);
  }, [tasks, filter, ws.today]);

  const topFull = ws.todayView.topTaskIds.length >= 3;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="상태"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "열림" },
            { value: "done", label: "완료" },
          ]}
        />
        <SearchInput
          aria-label="할 일 검색"
          placeholder="검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="order-first w-full sm:order-none sm:w-48"
        />
        <Select
          aria-label="프로젝트로 거르기"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-auto max-w-48"
        >
          <option value="">모든 프로젝트</option>
          {ws.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Button className="ml-auto" onClick={() => edit(null)}>
          <Plus className="size-4" aria-hidden /> 새 할 일
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "열린 할 일이 없습니다." : "최근 완료한 할 일이 없습니다."}
          description="새 할 일을 추가하거나 Inbox에서 옮겨 오세요."
        />
      ) : (
        groups.map((g) => (
          <Card key={g.id}>
            <CardHeader title={g.title} description={`${g.items.length}개`} as="h2" />
            <ul className="divide-y divide-border">
              {g.items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={edit}
                  trailing={
                    t.status === "open" && t.topDate !== ws.today ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${t.title} 오늘의 3가지로`}
                        title={topFull ? "오늘의 3가지가 가득 찼습니다" : "오늘의 3가지로"}
                        disabled={topFull}
                        onClick={() =>
                          run({
                            type: "task.setTop",
                            payload: { taskId: t.id, expectedVersion: t.version, date: ws.today },
                          })
                        }
                      >
                        <Star className="size-4" aria-hidden />
                      </Button>
                    ) : null
                  }
                />
              ))}
            </ul>
          </Card>
        ))
      )}
      <TaskEditor
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={setOpen}
        task={editing}
        defaults={{ projectId: projectId || null }}
      />
    </div>
  );
}
