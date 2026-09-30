"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Inbox,
  Minus,
  PartyPopper,
  Plus,
  Repeat,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@liferoute/contracts";
import { formatDateKo, formatKrw, formatKrwCompact, goalPercent } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/app/card";
import { StatTile } from "@/components/app/stat-tile";
import { GoalRing } from "@/components/app/goal-ring";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/app/dialog";
import { TextInput } from "@/components/app/fields";
import { TaskRow } from "@/components/plan/task-row";
import { TaskEditor } from "@/components/plan/task-editor";
import { useWorkspace } from "@/lib/workspace";
import { relativeDay, timeLabel } from "@/lib/dates";

/** 오늘 (FR-001): Top 3, today's schedule, routines and net worth on one screen. */
export default function TodayPage() {
  const { ws } = useWorkspace();
  const [editing, setEditing] = useState<Task | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const open = (task: Task | null) => {
    setEditing(task);
    setEditorOpen(true);
  };
  const confetti = useRef<ConfettiRef>(null);
  const celebrate = () =>
    void confetti.current?.fire({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.3 },
      disableForReducedMotion: true,
    });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={formatDateKo(ws.today)}
        title="오늘"
        description="많이 하는 것보다 중요한 것을 끝내는 하루."
      />
      <TodayStats />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <BlurFade delay={0.05}>
            <TopThree onOpen={open} onAllDone={celebrate} />
          </BlurFade>
          <BlurFade delay={0.1}>
            <Schedule onOpen={open} />
          </BlurFade>
          <Overdue onOpen={open} />
        </div>
        <div className="space-y-4">
          <BlurFade delay={0.1}>
            <Routines />
          </BlurFade>
          <BlurFade delay={0.15}>
            <NetWorth />
          </BlurFade>
        </div>
      </div>
      <TaskEditor key={editing?.id ?? "new"} open={editorOpen} onOpenChange={setEditorOpen} task={editing} />
      {/* Outside the BlurFade wrappers: their filter would clip a fixed canvas to the card. */}
      <Confetti
        ref={confetti}
        manualstart
        className="pointer-events-none fixed inset-0 z-50 size-full"
        aria-hidden
      />
    </div>
  );
}

/** Four at-a-glance counts; each links to the screen that manages it. */
function TodayStats() {
  const { ws } = useWorkspace();
  const chosenDone = ws.tasks.filter((t) => t.topDate === ws.today && t.status === "done").length;
  const routines = ws.todayView.routines.filter((r) => r.state !== "notExpected");
  const routinesDone = routines.filter((r) => r.state === "done").length;
  const scheduleCount = ws.todayView.calendarEventIds.length + ws.todayView.plannedTaskIds.length;
  const inboxNew = ws.inbox.filter((i) => i.status === "new").length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={Star}
        label="3가지 완료"
        value={chosenDone}
        total={3}
        progress={(chosenDone / 3) * 100}
      />
      <StatTile
        icon={Repeat}
        label="루틴"
        value={routinesDone}
        total={routines.length}
        progress={routines.length ? (routinesDone / routines.length) * 100 : 0}
        href="/plans?tab=routines"
      />
      <StatTile
        icon={CalendarDays}
        label="오늘 일정"
        value={scheduleCount}
        hint={scheduleCount ? "시간순으로 아래에 정리" : "잡힌 일정 없음"}
        href="/plans?tab=calendar"
      />
      <StatTile
        icon={Inbox}
        label="Inbox"
        value={inboxNew}
        hint={inboxNew ? "정리할 캡처가 있습니다" : "모두 정리됨"}
        href="/inbox"
      />
    </div>
  );
}

function TopThree({ onOpen, onAllDone }: { onOpen: (t: Task) => void; onAllDone: () => void }) {
  const { ws, run } = useWorkspace();
  const byId = useMemo(() => new Map(ws.tasks.map((t) => [t.id, t])), [ws.tasks]);
  const top = ws.todayView.topTaskIds.map((id) => byId.get(id)).filter(Boolean) as Task[];
  const doneToday = ws.tasks.filter((t) => t.topDate === ws.today && t.status === "done");
  const stale = ws.todayView.staleTopTaskIds.map((id) => byId.get(id)).filter(Boolean) as Task[];
  const [picker, setPicker] = useState(false);
  const [quick, setQuick] = useState("");
  const reduceMotion = useReducedMotion();
  const previousDone = useRef(doneToday.length);
  useEffect(() => {
    // Celebrate the moment the third chosen task is finished (not on page load).
    if (previousDone.current < 3 && doneToday.length >= 3 && top.length === 0) onAllDone();
    previousDone.current = doneToday.length;
  }, [doneToday.length, top.length, onAllDone]);

  async function addQuick() {
    const title = quick.trim();
    if (!title) return;
    const created = await run({ type: "task.create", payload: { title } });
    if (!created) return;
    const ok = await run({
      type: "task.setTop",
      payload: { taskId: created.task.id, expectedVersion: created.task.version, date: ws.today },
    });
    if (ok) setQuick("");
  }

  return (
    <Card aria-labelledby="top3-title" className="relative overflow-hidden">
      {top.length > 0 && !reduceMotion ? (
        <BorderBeam size={140} duration={9} colorFrom="#0f766e" colorTo="#5eead4" borderWidth={1.5} />
      ) : null}
      <CardHeader
        title={
          <span id="top3-title" className="inline-flex items-center gap-1.5">
            <Star className="size-4 text-primary" aria-hidden /> 오늘의 3가지
          </span>
        }
        description={`${top.length}/3 · 완료 ${doneToday.length}`}
        action={
          top.length < 3 ? (
            <Button size="sm" variant="soft" onClick={() => setPicker(true)}>
              <Plus className="size-4" aria-hidden /> 고르기
            </Button>
          ) : null
        }
      />
      {stale.length > 0 ? (
        <div className="mb-3 rounded-xl bg-warning/10 px-3 py-2.5 text-[13px]">
          <p className="font-semibold text-warning">
            지난 날의 3가지 중 {stale.length}개가 아직 열려 있습니다.
          </p>
          <ul className="mt-1.5 space-y-1">
            {stale.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {t.title}{" "}
                  <span className="text-muted-foreground">({relativeDay(t.topDate!, ws.today)})</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={top.length >= 3}
                    onClick={() =>
                      run({
                        type: "task.setTop",
                        payload: { taskId: t.id, expectedVersion: t.version, date: ws.today },
                      })
                    }
                  >
                    오늘로
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t.title} 목록에서 빼기`}
                    onClick={() =>
                      run({ type: "task.clearTop", payload: { taskId: t.id, expectedVersion: t.version } })
                    }
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {top.length === 0 ? (
        doneToday.length > 0 ? (
          <EmptyState
            icon={<PartyPopper aria-hidden />}
            title="오늘 고른 일을 모두 끝냈습니다."
            description="더 할 일이 있으면 다시 고르거나 바로 추가하세요."
          />
        ) : (
          <EmptyState
            title="오늘 꼭 할 3가지를 골라 보세요."
            description="많이 하는 것보다 중요한 것을 끝내는 하루를 위해."
          />
        )
      ) : (
        <ol className="divide-y divide-border">
          {top.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={onOpen}
              showTop={false}
              trailing={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t.title} 오늘의 3가지에서 빼기`}
                  onClick={() =>
                    run({ type: "task.clearTop", payload: { taskId: t.id, expectedVersion: t.version } })
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              }
            />
          ))}
        </ol>
      )}
      {top.length < 3 ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addQuick();
          }}
        >
          <TextInput
            aria-label="새 할 일을 오늘의 3가지로 추가"
            placeholder="새 할 일을 바로 추가"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            maxLength={200}
          />
          <Button type="submit" disabled={!quick.trim()}>
            추가
          </Button>
        </form>
      ) : null}
      {doneToday.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {doneToday.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} showTop={false} />
          ))}
        </ul>
      ) : null}
      <TopPicker open={picker} onOpenChange={setPicker} />
    </Card>
  );
}

function TopPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { ws, run } = useWorkspace();
  const [query, setQuery] = useState("");
  const candidates = ws.tasks
    .filter((t) => t.status === "open" && t.topDate !== ws.today)
    .filter((t) => !query || t.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const remaining = 3 - ws.todayView.topTaskIds.length;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="오늘의 3가지 고르기"
      description={`${remaining}개 더 고를 수 있습니다.`}
    >
      <TextInput
        aria-label="할 일 검색"
        placeholder="검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      {candidates.length === 0 ? (
        <EmptyState
          title="고를 수 있는 열린 할 일이 없습니다."
          description="빠른 캡처나 계획 화면에서 할 일을 먼저 추가하세요."
        />
      ) : (
        <ul className="divide-y divide-border">
          {candidates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{t.title}</p>
                {t.dueDate ? (
                  <p className="text-[12px] text-muted-foreground">마감 {relativeDay(t.dueDate, ws.today)}</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="soft"
                disabled={remaining <= 0}
                onClick={async () => {
                  const ok = await run({
                    type: "task.setTop",
                    payload: { taskId: t.id, expectedVersion: t.version, date: ws.today },
                  });
                  if (ok && remaining <= 1) onOpenChange(false);
                }}
              >
                선택
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function Schedule({ onOpen }: { onOpen: (t: Task) => void }) {
  const { ws } = useWorkspace();
  const google = ws.connections.find((c) => c.provider === "google");
  const events = ws.todayView.calendarEventIds
    .map((id) => ws.calendarEvents.find((e) => e.id === id))
    .filter(Boolean);
  const planned = ws.todayView.plannedTaskIds
    .map((id) => ws.tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];
  type Item = {
    key: string;
    sort: string;
    time: string;
    title: string;
    sub?: string;
    task?: Task;
    badge?: string;
  };
  const items: Item[] = [
    ...events.map((e) => ({
      key: e!.id,
      sort: e!.when.allDay ? "0" : `1${e!.when.start}`,
      time: e!.when.allDay ? "종일" : `${timeLabel(e!.when.start)}–${timeLabel(e!.when.end)}`,
      title: e!.title,
      sub: e!.location ?? undefined,
      badge: e!.source === "google" ? (e!.managed ? "LifeRoute" : "Google") : undefined,
    })),
    ...planned.map((t) => ({
      key: t.id,
      sort: `1${t.plannedAt}`,
      time: timeLabel(t.plannedAt!),
      title: t.title,
      sub: t.plannedDurationMin ? `${t.plannedDurationMin}분` : undefined,
      task: t,
      badge: "할 일",
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-primary" aria-hidden /> 오늘 일정
          </span>
        }
        description={
          google?.status === "connected"
            ? `Google 동기화: ${google.lastSuccessAt ? "완료" : "대기"}`
            : "Google 캘린더 미연결 · LifeRoute 일정만 표시"
        }
        action={
          <Link href="/plans?tab=calendar" className="text-[13px] font-semibold text-primary hover:underline">
            일정 관리
          </Link>
        }
      />
      {google && google.status !== "connected" && google.status !== "disconnected" ? (
        <p className="mb-2 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
          Google 동기화 상태:{" "}
          {google.status === "reauth_required"
            ? "재로그인 필요"
            : google.status === "stale"
              ? "지연됨"
              : "실패"}{" "}
          ·{" "}
          <Link href="/settings#connections" className="underline">
            설정에서 확인
          </Link>
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="오늘 잡힌 일정이 없습니다."
          description="할 일에 시각을 정하면 여기에 나타납니다."
        />
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
              <span className="num w-[6.75rem] shrink-0 whitespace-nowrap pt-0.5 text-[13px] font-semibold text-muted-foreground">
                {item.time}
              </span>
              <div className="min-w-0 flex-1">
                {item.task ? (
                  <button
                    type="button"
                    onClick={() => onOpen(item.task!)}
                    className="truncate text-left text-[15px] font-medium hover:text-primary"
                  >
                    {item.title}
                  </button>
                ) : (
                  <p className="truncate text-[15px] font-medium">{item.title}</p>
                )}
                {item.sub ? <p className="truncate text-[12px] text-muted-foreground">{item.sub}</p> : null}
              </div>
              {item.badge ? (
                <Badge tone={item.badge === "할 일" ? "accent" : "neutral"}>{item.badge}</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Overdue({ onOpen }: { onOpen: (t: Task) => void }) {
  const { ws } = useWorkspace();
  const overdue = ws.tasks
    .filter((t) => t.status === "open" && t.dueDate && t.dueDate < ws.today && t.topDate !== ws.today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const dueToday = ws.tasks.filter(
    (t) => t.status === "open" && t.dueDate === ws.today && t.topDate !== ws.today,
  );
  if (overdue.length === 0 && dueToday.length === 0) return null;
  return (
    <Card>
      <CardHeader title="마감 확인" description={`지남 ${overdue.length} · 오늘 마감 ${dueToday.length}`} />
      <ul className="divide-y divide-border">
        {[...overdue, ...dueToday].slice(0, 8).map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpen} />
        ))}
      </ul>
    </Card>
  );
}

function Routines() {
  const { ws, run } = useWorkspace();
  const rows = ws.todayView.routines
    .map((r) => ({ ...r, routine: ws.routines.find((x) => x.id === r.routineId)! }))
    .filter((r) => r.routine && r.state !== "notExpected");
  const others = ws.todayView.routines.filter((r) => r.state === "notExpected").length;
  const done = rows.filter((r) => r.state === "done").length;
  return (
    <Card>
      <CardHeader
        title="루틴"
        description={
          rows.length
            ? `오늘 ${done}/${rows.length} 완료${others ? ` · 오늘 쉬는 루틴 ${others}` : ""}`
            : undefined
        }
        action={
          <Link href="/plans?tab=routines" className="text-[13px] font-semibold text-primary hover:underline">
            관리
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="오늘 예정된 루틴이 없습니다."
          description="계획 > 루틴에서 매일·평일·요일·매월 루틴을 만들 수 있습니다."
        />
      ) : (
        <ul className="space-y-1.5">
          {rows.map(({ routine, state }) => (
            <li key={routine.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "skipped" && "bg-border text-muted-foreground",
                  state === "unrecorded" && "border border-dashed border-input text-muted-foreground",
                )}
                aria-hidden
              >
                {state === "done" ? (
                  <Check className="size-4" />
                ) : state === "skipped" ? (
                  <Minus className="size-4" />
                ) : (
                  ""
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{routine.title}</span>
                <span className="text-[12px] text-muted-foreground">
                  {state === "done" ? "완료" : state === "skipped" ? "건너뜀" : "미기록"}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                {state !== "done" ? (
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() =>
                      run({
                        type: "checkin.record",
                        payload: { routineId: routine.id, date: ws.today, status: "done" },
                      })
                    }
                  >
                    완료
                  </Button>
                ) : null}
                {state === "unrecorded" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run({
                        type: "checkin.record",
                        payload: { routineId: routine.id, date: ws.today, status: "skipped" },
                      })
                    }
                  >
                    건너뛰기
                  </Button>
                ) : null}
                {state !== "unrecorded" ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${routine.title} 기록 지우기`}
                    onClick={() =>
                      run({ type: "checkin.clear", payload: { routineId: routine.id, date: ws.today } })
                    }
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NetWorth() {
  const { ws } = useWorkspace();
  const nw = ws.netWorth;
  const percent = goalPercent(nw.netWorthKrw, nw.goal.amountKrw);
  const hasData = ws.accounts.length > 0;
  return (
    <Card>
      <CardHeader
        title="순자산"
        description={
          nw.latestAsOf
            ? `잔액 기준 ${nw.earliestAsOf === nw.latestAsOf ? nw.latestAsOf : `${nw.earliestAsOf} ~ ${nw.latestAsOf}`}`
            : undefined
        }
        action={
          <Link
            href="/assets"
            className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-primary hover:underline"
          >
            자산 <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {!hasData ? (
        <EmptyState
          title="아직 계좌가 없습니다."
          description="자산에서 계좌를 추가하고 오늘 잔액을 기록하세요."
          action={
            <Link href="/assets" className="text-sm font-semibold text-primary underline">
              계좌 추가
            </Link>
          }
        />
      ) : (
        <>
          <p className="num text-[30px] leading-tight font-bold tracking-tight">
            {formatKrw(nw.netWorthKrw)}
          </p>
          <p className="num mt-0.5 text-[13px] text-muted-foreground">
            자산 {formatKrwCompact(nw.includedAssetsKrw)} · 부채 {formatKrwCompact(nw.liabilitiesKrw)} · 유동{" "}
            {formatKrwCompact(nw.liquidAssetsKrw)}
          </p>
          <div className="mt-4 flex items-center gap-4 rounded-xl bg-muted/60 p-3">
            <GoalRing percent={percent} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">
                목표 {formatKrwCompact(nw.goal.amountKrw)}
                <span className="num ml-1.5 text-primary">{percent.toFixed(1)}%</span>
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {nw.goal.status === "achieved"
                  ? "목표를 달성했습니다."
                  : nw.goal.status === "overdue"
                    ? `목표일(${nw.goal.targetDate})이 지났습니다. 설정에서 목표를 다시 정하세요.`
                    : `${nw.goal.targetDate}까지 ${nw.goal.remainingMonths}개월 · 매달 ${formatKrw(nw.goal.monthlyRequiredKrw ?? "0")} 필요`}
              </p>
            </div>
          </div>
          {nw.data === "incomplete" ? (
            <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
              {nw.missingAccountIds.length ? `잔액 없는 계좌 ${nw.missingAccountIds.length}개 ` : ""}
              {nw.staleAccountIds.length ? `오래된 잔액 ${nw.staleAccountIds.length}개 ` : ""}— 합계가 실제와
              다를 수 있습니다.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
