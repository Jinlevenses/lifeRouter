"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FolderKanban, ListChecks, Repeat } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/card";
import { TasksTab } from "@/components/plan/tasks-tab";
import { ProjectsTab } from "@/components/plan/projects-tab";
import { RoutinesTab } from "@/components/plan/routines-tab";
import { CalendarTab } from "@/components/plan/calendar-tab";

const TABS = [
  { id: "tasks", label: "할 일", icon: ListChecks },
  { id: "projects", label: "목표·프로젝트", icon: FolderKanban },
  { id: "routines", label: "루틴", icon: Repeat },
  { id: "calendar", label: "일정", icon: CalendarDays },
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
      <Tabs value={tab} onValueChange={(v) => router.replace(`/plans?tab=${v}`, { scroll: false })}>
        <TabsList aria-label="계획 보기" className="mb-4 h-10 w-full justify-start overflow-x-auto sm:w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1 gap-1.5 px-3 sm:flex-none">
              <t.icon className="hidden sm:block" aria-hidden />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab />
        </TabsContent>
        <TabsContent value="routines">
          <RoutinesTab />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
