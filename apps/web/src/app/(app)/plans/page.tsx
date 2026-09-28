"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/card";
import { TasksTab } from "@/components/plan/tasks-tab";
import { ProjectsTab } from "@/components/plan/projects-tab";
import { RoutinesTab } from "@/components/plan/routines-tab";
import { CalendarTab } from "@/components/plan/calendar-tab";

const TABS = [
  { id: "tasks", label: "할 일" },
  { id: "projects", label: "목표·프로젝트" },
  { id: "routines", label: "루틴" },
  { id: "calendar", label: "일정" },
] as const;

/** 계획 (FR-002..FR-004, FR-008): Goal = direction, Project = done criteria, Task = unit of work. */
export default function PlansPage() {
  return (
    <Suspense>
      <Plans />
    </Suspense>
  );
}

function Plans() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "tasks";
  return (
    <>
      <PageHeader title="계획" description="목표는 방향, 프로젝트는 완료 기준, 할 일은 실행 단위입니다." />
      <Tabs.Root value={tab} onValueChange={(v) => router.replace(`/plans?tab=${v}`, { scroll: false })}>
        <Tabs.List
          aria-label="계획 보기"
          className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 ring-1 ring-line"
        >
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t.id}
              value={t.id}
              className={clsx(
                "flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted",
                "data-[state=active]:bg-accent-soft data-[state=active]:text-accent-strong",
              )}
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="tasks">
          <TasksTab />
        </Tabs.Content>
        <Tabs.Content value="projects">
          <ProjectsTab />
        </Tabs.Content>
        <Tabs.Content value="routines">
          <RoutinesTab />
        </Tabs.Content>
        <Tabs.Content value="calendar">
          <CalendarTab />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
