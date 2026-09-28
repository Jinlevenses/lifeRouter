"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { Goal, Project } from "@liferoute/contracts";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay } from "@/lib/dates";
import { TaskEditor } from "./task-editor";

const GOAL_STATUS: Record<Goal["status"], string> = { active: "진행 중", achieved: "달성", dropped: "중단" };
const PROJECT_STATUS: Record<Project["status"], string> = {
  active: "진행 중",
  done: "완료",
  dropped: "중단",
};

export function ProjectsTab() {
  const { ws } = useWorkspace();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [project, setProject] = useState<{ project: Project | null; goalId: string | null } | null>(null);
  const [taskFor, setTaskFor] = useState<Project | null>(null);

  const sections = [
    ...ws.goals.map((g) => ({
      goal: g as Goal | null,
      projects: ws.projects.filter((p) => p.goalId === g.id),
    })),
    { goal: null, projects: ws.projects.filter((p) => !p.goalId) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setProject({ project: null, goalId: null })}>
          <Plus className="size-4" aria-hidden /> 프로젝트
        </Button>
        <Button variant="primary" onClick={() => setGoal(null)}>
          <Plus className="size-4" aria-hidden /> 목표
        </Button>
      </div>
      {ws.goals.length === 0 && ws.projects.length === 0 ? (
        <EmptyState
          title="아직 목표와 프로젝트가 없습니다."
          description="예: 목표 ‘건강한 몸’ → 프로젝트 ‘10km 완주’(완료 기준: 60분 안에 완주) → 할 일 ‘주 3회 달리기’"
        />
      ) : null}
      {sections.map(({ goal: g, projects }) =>
        g === null && projects.length === 0 ? null : (
          <Card key={g?.id ?? "none"}>
            <CardHeader
              title={g ? g.title : "목표 없는 프로젝트"}
              description={
                g ? (
                  <>
                    {GOAL_STATUS[g.status]}
                    {g.targetDate ? ` · 목표일 ${g.targetDate}` : ""}
                    {g.description ? ` · ${g.description}` : ""}
                  </>
                ) : undefined
              }
              action={
                g ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setProject({ project: null, goalId: g.id })}
                    >
                      <Plus className="size-4" aria-hidden /> 프로젝트
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${g.title} 편집`}
                      onClick={() => setGoal(g)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : null
              }
            />
            {projects.length === 0 ? (
              <p className="text-[13px] text-ink-muted">프로젝트가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line">
                {projects.map((p) => {
                  const tasks = ws.tasks.filter((t) => t.projectId === p.id);
                  const open = tasks.filter((t) => t.status === "open").length;
                  const done = tasks.filter((t) => t.status === "done").length;
                  return (
                    <li key={p.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="text-[15px] font-semibold hover:text-accent-strong"
                            onClick={() => setProject({ project: p, goalId: p.goalId })}
                          >
                            {p.title}
                          </button>
                          <Badge tone={p.status === "active" ? "accent" : "neutral"}>
                            {PROJECT_STATUS[p.status]}
                          </Badge>
                        </div>
                        {p.doneCriteria ? (
                          <p className="mt-0.5 text-[13px] text-ink-muted">완료 기준: {p.doneCriteria}</p>
                        ) : null}
                        <p className="mt-0.5 text-[12px] text-ink-subtle">
                          열린 할 일 {open} · 완료 {done}
                          {p.dueDate ? ` · 마감 ${relativeDay(p.dueDate, ws.today)}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setTaskFor(p)}>
                        <Plus className="size-4" aria-hidden /> 할 일
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ),
      )}
      {goal !== undefined ? (
        <GoalEditor key={goal?.id ?? "new"} goal={goal} onClose={() => setGoal(undefined)} />
      ) : null}
      {project ? (
        <ProjectEditor
          key={project.project?.id ?? "new"}
          project={project.project}
          goalId={project.goalId}
          onClose={() => setProject(null)}
        />
      ) : null}
      {taskFor ? (
        <TaskEditor open onOpenChange={(o) => !o && setTaskFor(null)} defaults={{ projectId: taskFor.id }} />
      ) : null}
    </div>
  );
}

function GoalEditor({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { run } = useWorkspace();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [status, setStatus] = useState<Goal["status"]>(goal?.status ?? "active");
  async function save() {
    const ok = goal
      ? await run({
          type: "goal.update",
          payload: {
            goalId: goal.id,
            expectedVersion: goal.version,
            patch: { title, description, targetDate: targetDate || null, status },
          },
        })
      : await run({ type: "goal.create", payload: { title, description, targetDate: targetDate || null } });
    if (ok) onClose();
  }
  async function remove() {
    if (!goal || !window.confirm("목표를 삭제할까요? 연결된 프로젝트·할 일은 남고 목표 연결만 풀립니다."))
      return;
    if (await run({ type: "goal.delete", payload: { goalId: goal.id, expectedVersion: goal.version } }))
      onClose();
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={goal ? "목표 편집" : "새 목표"}
      description="오래 유지할 방향을 적으세요."
      footer={
        <>
          {goal ? (
            <Button variant="ghost" className="mr-auto text-danger" onClick={remove}>
              삭제
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="목표">
          {(id) => (
            <TextInput
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          )}
        </Field>
        <Field label="설명">
          {(id) => (
            <TextArea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="목표일 (선택)">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            )}
          </Field>
          {goal ? (
            <Field label="상태">
              {(id) => (
                <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
                  {Object.entries(GOAL_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function ProjectEditor({
  project,
  goalId,
  onClose,
}: {
  project: Project | null;
  goalId: string | null;
  onClose: () => void;
}) {
  const { ws, run } = useWorkspace();
  const [title, setTitle] = useState(project?.title ?? "");
  const [doneCriteria, setDoneCriteria] = useState(project?.doneCriteria ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [goal, setGoal] = useState(project?.goalId ?? goalId ?? "");
  const [status, setStatus] = useState<Project["status"]>(project?.status ?? "active");
  async function save() {
    const ok = project
      ? await run({
          type: "project.update",
          payload: {
            projectId: project.id,
            expectedVersion: project.version,
            patch: { title, doneCriteria, dueDate: dueDate || null, goalId: goal || null, status },
          },
        })
      : await run({
          type: "project.create",
          payload: { title, doneCriteria, dueDate: dueDate || null, goalId: goal || null },
        });
    if (ok) onClose();
  }
  async function remove() {
    if (!project || !window.confirm("프로젝트를 삭제할까요? 할 일은 남고 프로젝트 연결만 풀립니다.")) return;
    if (
      await run({
        type: "project.delete",
        payload: { projectId: project.id, expectedVersion: project.version },
      })
    )
      onClose();
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={project ? "프로젝트 편집" : "새 프로젝트"}
      description="끝났다고 말할 수 있는 기준이 있는 일입니다."
      footer={
        <>
          {project ? (
            <Button variant="ghost" className="mr-auto text-danger" onClick={remove}>
              삭제
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="프로젝트">
          {(id) => (
            <TextInput
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          )}
        </Field>
        <Field label="완료 기준" hint="예: 60분 안에 10km 완주">
          {(id, hint) => (
            <TextArea
              id={id}
              value={doneCriteria}
              onChange={(e) => setDoneCriteria(e.target.value)}
              rows={2}
              aria-describedby={hint}
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="목표">
            {(id) => (
              <Select id={id} value={goal} onChange={(e) => setGoal(e.target.value)}>
                <option value="">없음</option>
                {ws.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="마감일">
            {(id) => (
              <TextInput id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            )}
          </Field>
          {project ? (
            <Field label="상태">
              {(id) => (
                <Select
                  id={id}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Project["status"])}
                >
                  {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
