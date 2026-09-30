"use client";

import { useState } from "react";
import type { Recurrence, Task } from "@liferoute/contracts";
import { Sheet } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";
import { seoulInstant, seoulParts } from "@/lib/dates";
import { RecurrenceEditor } from "./recurrence-editor";

/**
 * Create/edit a task (FR-002): dueDate (deadline, date-only) and plannedAt (calendar slot, instant)
 * are separate fields; recurring tasks need a due date.
 */
export function TaskEditor({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaults?: { projectId?: string | null; goalId?: string | null; dueDate?: string | null };
}) {
  const { ws, run } = useWorkspace();
  const planned = task?.plannedAt ? seoulParts(task.plannedAt) : null;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? defaults?.dueDate ?? "");
  const [planDate, setPlanDate] = useState(planned?.date ?? "");
  const [planTime, setPlanTime] = useState(planned?.time ?? "09:00");
  const [duration, setDuration] = useState(task?.plannedDurationMin ? String(task.plannedDurationMin) : "");
  const [projectId, setProjectId] = useState(task?.projectId ?? defaults?.projectId ?? "");
  const [goalId, setGoalId] = useState(task?.goalId ?? defaults?.goalId ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence | null>(task?.recurrence ?? null);
  const [saving, setSaving] = useState(false);

  const needsDue = recurrence !== null && !dueDate;
  const projectGoal = projectId ? (ws.projects.find((p) => p.id === projectId)?.goalId ?? null) : null;

  async function save() {
    if (!title.trim() || needsDue) return;
    setSaving(true);
    const plannedAt = planDate ? seoulInstant(planDate, planTime || "09:00") : null;
    const plannedDurationMin = planDate && duration ? Math.min(1440, Math.max(5, Number(duration))) : null;
    const common = {
      title: title.trim(),
      description,
      dueDate: dueDate || null,
      plannedAt,
      plannedDurationMin,
      projectId: projectId || null,
      goalId: projectId ? null : goalId || null,
      recurrence,
    };
    const ok = task
      ? await run(
          { type: "task.update", payload: { taskId: task.id, expectedVersion: task.version, patch: common } },
          { success: "저장했습니다." },
        )
      : await run({ type: "task.create", payload: common }, { success: "할 일을 추가했습니다." });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  async function act(type: "task.cancel" | "task.delete") {
    if (!task) return;
    if (type === "task.delete" && !window.confirm("이 할 일을 삭제할까요?")) return;
    const ok = await run({ type, payload: { taskId: task.id, expectedVersion: task.version } });
    if (ok) onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "할 일 편집" : "새 할 일"}
      footer={
        <>
          {task ? (
            <div className="mr-auto flex gap-1">
              {task.status === "open" ? (
                <Button variant="ghost" size="sm" onClick={() => act("task.cancel")}>
                  취소 처리
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => act("task.delete")}
              >
                삭제
              </Button>
            </div>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={save} disabled={!title.trim() || needsDue || saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="제목">
          {(id) => (
            <TextInput
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          )}
        </Field>
        <Field label="메모">
          {(id) => (
            <TextArea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={2}
            />
          )}
        </Field>
        <Field
          label="마감일"
          hint="이 날까지 끝내야 하는 날짜"
          error={needsDue ? "반복 할 일에는 마감일이 필요합니다." : null}
        >
          {(id, hint) => (
            <TextInput
              id={id}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-describedby={hint}
            />
          )}
        </Field>
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-[13px] font-semibold text-muted-foreground">
            캘린더에 배치 (선택)
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="날짜">
              {(id) => (
                <TextInput
                  id={id}
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                />
              )}
            </Field>
            <Field label="시각">
              {(id) => (
                <TextInput
                  id={id}
                  type="time"
                  value={planTime}
                  onChange={(e) => setPlanTime(e.target.value)}
                  disabled={!planDate}
                />
              )}
            </Field>
            <Field label="소요(분)">
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={1440}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={!planDate}
                />
              )}
            </Field>
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="프로젝트">
            {(id) => (
              <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">없음</option>
                {ws.projects
                  .filter((p) => p.status === "active" || p.id === projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="목표" hint={projectId ? "프로젝트의 목표를 따릅니다." : undefined}>
            {(id, hint) => (
              <Select
                id={id}
                value={projectId ? (projectGoal ?? "") : goalId}
                onChange={(e) => setGoalId(e.target.value)}
                disabled={!!projectId}
                aria-describedby={hint}
              >
                <option value="">없음</option>
                {ws.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <RecurrenceEditor value={recurrence} onChange={setRecurrence} defaultStart={dueDate || ws.today} />
        {recurrence ? (
          <p className="text-[12px] text-muted-foreground">
            완료하면 다음 마감일로 새 할 일이 생깁니다. 밀린 반복은 쌓이지 않습니다.
          </p>
        ) : null}
        <button type="submit" className="sr-only">
          저장
        </button>
      </form>
    </Sheet>
  );
}
