"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Pencil, Plus } from "lucide-react";
import clsx from "clsx";
import type { Recurrence, Routine, RoutineDayState } from "@liferoute/contracts";
import {
  addDays,
  checkInKey,
  currentStreak,
  dayState,
  describeRecurrence,
  indexCheckIns,
  isoWeekday,
  koWeekday,
} from "@liferoute/core";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { useWorkspace } from "@/lib/workspace";
import { RecurrenceEditor } from "./recurrence-editor";

const LABEL: Record<RoutineDayState, string> = {
  done: "완료",
  skipped: "건너뜀",
  unrecorded: "미기록",
  notExpected: "예정 없음",
};

/** 루틴 (FR-004): the last 7 days per routine; tapping a day cycles 미기록 → 완료 → 건너뜀 → 미기록. */
export function RoutinesTab() {
  const { ws, run } = useWorkspace();
  const [editing, setEditing] = useState<Routine | null | undefined>(undefined);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws.today, i - 6)), [ws.today]);
  const index = useMemo(() => indexCheckIns(ws.checkIns), [ws.checkIns]);

  async function cycle(routine: Routine, date: string, state: RoutineDayState) {
    if (state === "unrecorded" || state === "notExpected") {
      await run({ type: "checkin.record", payload: { routineId: routine.id, date, status: "done" } });
    } else if (state === "done") {
      await run({ type: "checkin.record", payload: { routineId: routine.id, date, status: "skipped" } });
    } else {
      await run({ type: "checkin.clear", payload: { routineId: routine.id, date } });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden /> 새 루틴
        </Button>
      </div>
      {ws.routines.length === 0 ? (
        <EmptyState
          title="루틴이 없습니다."
          description="매일·평일·요일·매월 반복을 정할 수 있습니다. 기록하지 않은 날은 ‘건너뜀’이 아니라 ‘미기록’으로 남습니다."
        />
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-1.5 text-sm">
            <caption className="sr-only">최근 7일 루틴 기록</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-1 text-left text-[13px] font-semibold text-ink-muted">
                  루틴
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={clsx(
                      "pb-1 text-center text-[12px] font-semibold",
                      d === ws.today ? "text-accent-strong" : "text-ink-muted",
                    )}
                  >
                    {koWeekday(isoWeekday(d))}
                    <span className="block font-normal">{Number(d.slice(8))}</span>
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">편집</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ws.routines.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="max-w-[12rem] pr-2 text-left align-middle font-normal">
                    <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                    <span className="text-[12px] text-ink-muted">
                      {describeRecurrence(r.schedule)} · 연속 {currentStreak(r, index, ws.today)}일
                    </span>
                    {r.status !== "active" ? (
                      <Badge className="ml-1">{r.status === "paused" ? "일시정지" : "보관"}</Badge>
                    ) : null}
                  </th>
                  {days.map((d) => {
                    const state = dayState(r, index.get(checkInKey(r.id, d)), d);
                    return (
                      <td key={d} className="text-center">
                        <button
                          type="button"
                          onClick={() => cycle(r, d, state)}
                          aria-label={`${r.title} ${d} ${LABEL[state]} (눌러서 바꾸기)`}
                          className={clsx(
                            "mx-auto flex size-9 items-center justify-center rounded-full",
                            state === "done" && "bg-accent text-white",
                            state === "skipped" && "bg-line text-ink-muted",
                            state === "unrecorded" && "border-2 border-dashed border-line-strong",
                            state === "notExpected" && "text-ink-subtle hover:bg-canvas",
                          )}
                        >
                          {state === "done" ? (
                            <Check className="size-4" aria-hidden />
                          ) : state === "skipped" ? (
                            <Minus className="size-4" aria-hidden />
                          ) : state === "notExpected" ? (
                            "·"
                          ) : (
                            ""
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${r.title} 편집`}
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-ink-muted">
            ● 완료 · ─ 건너뜀 · ◌ 미기록(기대일인데 기록 없음) · · 예정 없음
          </p>
        </Card>
      )}
      {editing !== undefined ? (
        <RoutineEditor key={editing?.id ?? "new"} routine={editing} onClose={() => setEditing(undefined)} />
      ) : null}
    </div>
  );
}

function RoutineEditor({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const [title, setTitle] = useState(routine?.title ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [schedule, setSchedule] = useState<Recurrence>(
    routine?.schedule ?? { kind: "daily", startDate: ws.today, endDate: null },
  );
  const [status, setStatus] = useState<Routine["status"]>(routine?.status ?? "active");
  async function save() {
    const ok = routine
      ? await run({
          type: "routine.update",
          payload: {
            routineId: routine.id,
            expectedVersion: routine.version,
            patch: { title, description, schedule, status },
          },
        })
      : await run({ type: "routine.create", payload: { title, description, schedule } });
    if (ok) onClose();
  }
  async function remove() {
    if (!routine || !window.confirm("루틴을 삭제할까요? 지난 기록은 검토 집계에서 빠집니다.")) return;
    if (
      await run({
        type: "routine.delete",
        payload: { routineId: routine.id, expectedVersion: routine.version },
      })
    )
      onClose();
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={routine ? "루틴 편집" : "새 루틴"}
      footer={
        <>
          {routine ? (
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
        <Field label="루틴">
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
            <TextArea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          )}
        </Field>
        <RecurrenceEditor
          value={schedule}
          onChange={(v) => v && setSchedule(v)}
          allowNone={false}
          defaultStart={ws.today}
        />
        {routine ? (
          <Field label="상태" hint="일시정지·보관한 루틴은 미기록으로 세지 않습니다.">
            {(id, hint) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as Routine["status"])}
                aria-describedby={hint}
              >
                <option value="active">진행 중</option>
                <option value="paused">일시정지</option>
                <option value="archived">보관</option>
              </Select>
            )}
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
