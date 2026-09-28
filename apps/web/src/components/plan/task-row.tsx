"use client";

import { useState } from "react";
import clsx from "clsx";
import { CalendarClock, Flag, Repeat, Star } from "lucide-react";
import type { Task } from "@liferoute/contracts";
import { describeRecurrence } from "@liferoute/core";
import { useWorkspace } from "@/lib/workspace";
import { useToast } from "@/components/ui/toast";
import { instantLabel, relativeDay } from "@/lib/dates";

/** One task line: completion checkbox, title, due / planned / project metadata. */
export function TaskRow({
  task,
  onOpen,
  trailing,
  showTop = true,
}: {
  task: Task;
  onOpen?: (task: Task) => void;
  trailing?: React.ReactNode;
  showTop?: boolean;
}) {
  const { ws, run } = useWorkspace();
  const toast = useToast();
  const toastNext = (due: string) =>
    toast.show({ tone: "info", title: `다음 반복을 ${relativeDay(due, ws.today)}로 만들었습니다.` });
  const project = task.projectId ? ws.projects.find((p) => p.id === task.projectId) : null;
  // Optimistic checkbox (docs/05_web): flips immediately, settles to the server state after refresh.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const done = optimistic ?? task.status === "done";
  const overdue = task.status === "open" && task.dueDate !== null && task.dueDate < ws.today;

  async function toggle() {
    setOptimistic(task.status === "open");
    try {
      await persist();
    } finally {
      setOptimistic(null);
    }
  }

  async function persist() {
    if (task.status === "open") {
      const result = await run({
        type: "task.complete",
        payload: { taskId: task.id, expectedVersion: task.version },
      });
      if (result?.nextOccurrence?.dueDate) {
        toastNext(result.nextOccurrence.dueDate);
      }
    } else {
      await run({ type: "task.reopen", payload: { taskId: task.id, expectedVersion: task.version } });
    }
  }

  return (
    <li className="group flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={done}
        onChange={toggle}
        aria-label={done ? `${task.title} 완료 취소` : `${task.title} 완료`}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-[var(--color-accent)]"
        disabled={task.status === "cancelled"}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen?.(task)}
          className={clsx(
            "block max-w-full truncate text-left text-[15px] font-medium",
            done && "text-ink-subtle line-through",
            task.status === "cancelled" && "text-ink-subtle line-through",
            onOpen && "hover:text-accent-strong",
          )}
        >
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-muted">
          {showTop && task.topDate === ws.today && task.status === "open" ? (
            <span className="inline-flex items-center gap-1 text-accent-strong">
              <Star className="size-3" aria-hidden /> 오늘의 {task.topRank}
            </span>
          ) : null}
          {task.dueDate ? (
            <span className={clsx("inline-flex items-center gap-1", overdue && "font-semibold text-danger")}>
              <Flag className="size-3" aria-hidden /> 마감 {relativeDay(task.dueDate, ws.today)}
              {overdue ? " (지남)" : ""}
            </span>
          ) : null}
          {task.plannedAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" aria-hidden /> {instantLabel(task.plannedAt, ws.today)}
              {task.plannedDurationMin ? ` · ${task.plannedDurationMin}분` : ""}
            </span>
          ) : null}
          {task.recurrence ? (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" aria-hidden /> {describeRecurrence(task.recurrence)}
            </span>
          ) : null}
          {project ? <span className="truncate">· {project.title}</span> : null}
        </div>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </li>
  );
}
