"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { CalendarEvent, CalendarEventDraft, EventWhen, Proposal } from "@liferoute/contracts";
import { TIMEZONE } from "@liferoute/contracts";
import { addDays, dateInZone, formatDateKo } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/app/dialog";
import { Checkbox, Field, TextArea, TextInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";
import { seoulInstant, seoulParts, timeLabel } from "@/lib/dates";

const PROPOSAL_STATUS: Record<Proposal["status"], string> = {
  pending: "승인 대기",
  approved: "적용 중",
  applied: "적용됨",
  rejected: "거절됨",
  failed: "실패",
  expired: "만료",
};

function eventDate(e: CalendarEvent): string {
  return e.when.allDay ? e.when.startDate : dateInZone(e.when.start, TIMEZONE);
}

/**
 * 일정 (FR-008, ADR-003): LifeRoute events are edited directly; Google events are read-only.
 * Writing to Google always goes through a proposal the owner approves, and only for the
 * separate managed "LifeRoute" calendar.
 */
export function CalendarTab() {
  const { ws, run } = useWorkspace();
  const [editor, setEditor] = useState<{ event: CalendarEvent | null; mode: "local" | "propose" } | null>(
    null,
  );
  const google = ws.connections.find((c) => c.provider === "google");
  const connected = google?.status === "connected";

  const upcoming = useMemo(() => {
    const until = addDays(ws.today, 14);
    return ws.calendarEvents
      .filter((e) => e.status !== "cancelled" && eventDate(e) >= ws.today && eventDate(e) <= until)
      .sort((a, b) =>
        (a.when.allDay ? a.when.startDate : a.when.start).localeCompare(
          b.when.allDay ? b.when.startDate : b.when.start,
        ),
      );
  }, [ws.calendarEvents, ws.today]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of upcoming) map.set(eventDate(e), [...(map.get(eventDate(e)) ?? []), e]);
    return [...map.entries()];
  }, [upcoming]);
  const openProposals = ws.proposals.filter((p) => ["pending", "approved", "failed"].includes(p.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Google 캘린더:{" "}
          {connected ? (
            <Badge tone="accent">연결됨</Badge>
          ) : (
            <>
              <Badge>{google?.status === "reauth_required" ? "재로그인 필요" : "미연결"}</Badge>{" "}
              <Link href="/settings#connections" className="font-semibold text-primary underline">
                연결하기
              </Link>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditor({ event: null, mode: "propose" })}>
            Google에 일정 제안
          </Button>
          <Button onClick={() => setEditor({ event: null, mode: "local" })}>
            <Plus className="size-4" aria-hidden /> 일정
          </Button>
        </div>
      </div>

      {openProposals.length > 0 ? (
        <Card>
          <CardHeader title="Google 변경 제안" description="승인해야만 Google 캘린더에 반영됩니다." />
          <ul className="divide-y divide-border">
            {openProposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">
                    {p.kind === "calendar.create"
                      ? "새 일정"
                      : p.kind === "calendar.update"
                        ? "일정 변경"
                        : "일정 삭제"}
                    :{" "}
                    {p.draft?.title ?? ws.calendarEvents.find((e) => e.id === p.calendarEventId)?.title ?? ""}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {PROPOSAL_STATUS[p.status]}
                    {p.error ? ` · ${p.error}` : ""}
                  </p>
                </div>
                {p.status === "pending" || p.status === "failed" ? (
                  <span className="flex gap-1">
                    <Button
                      size="sm"

                      disabled={!connected}
                      title={connected ? undefined : "Google 연결 후 승인할 수 있습니다"}
                      onClick={() =>
                        run(
                          {
                            type: "calendar.approve",
                            payload: { proposalId: p.id, expectedVersion: p.version },
                          },
                          { success: "승인했습니다. 곧 반영됩니다." },
                        )
                      }
                    >
                      승인
                    </Button>
                    {p.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run({
                            type: "calendar.reject",
                            payload: { proposalId: p.id, expectedVersion: p.version },
                          })
                        }
                      >
                        거절
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="앞으로 14일" description={`${upcoming.length}개 일정`} />
        {byDay.length === 0 ? (
          <EmptyState title="예정된 일정이 없습니다." />
        ) : (
          <div className="space-y-4">
            {byDay.map(([day, events]) => (
              <section key={day} aria-label={formatDateKo(day)}>
                <h3 className="mb-1 text-[13px] font-semibold text-muted-foreground">
                  {day === ws.today ? "오늘" : formatDateKo(day)}
                </h3>
                <ul className="space-y-1">
                  {events.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() =>
                          e.source === "local"
                            ? setEditor({ event: e, mode: "local" })
                            : e.managed
                              ? setEditor({ event: e, mode: "propose" })
                              : undefined
                        }
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default"
                        disabled={e.source === "google" && !e.managed}
                      >
                        <span className="num w-[6.75rem] shrink-0 whitespace-nowrap text-[13px] font-semibold text-muted-foreground">
                          {e.when.allDay ? "종일" : `${timeLabel(e.when.start)}–${timeLabel(e.when.end)}`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px]">{e.title}</span>
                        {e.source === "google" ? (
                          <Badge tone={e.managed ? "accent" : "neutral"}>
                            {e.managed ? "LifeRoute" : "Google"}
                          </Badge>
                        ) : null}
                        {e.syncStatus === "conflict" ? <Badge tone="warn">충돌</Badge> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      {editor ? (
        <EventEditor
          key={editor.event?.id ?? editor.mode}
          event={editor.event}
          mode={editor.mode}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function EventEditor({
  event,
  mode,
  onClose,
}: {
  event: CalendarEvent | null;
  mode: "local" | "propose";
  onClose: () => void;
}) {
  const { ws, run } = useWorkspace();
  const start = event && !event.when.allDay ? seoulParts(event.when.start) : null;
  const end = event && !event.when.allDay ? seoulParts(event.when.end) : null;
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [allDay, setAllDay] = useState(event?.when.allDay ?? false);
  const [date, setDate] = useState(
    event ? (event.when.allDay ? event.when.startDate : start!.date) : ws.today,
  );
  const [endDate, setEndDate] = useState(event?.when.allDay ? event.when.endDate : (end?.date ?? ws.today));
  const [from, setFrom] = useState(start?.time ?? "09:00");
  const [to, setTo] = useState(end?.time ?? "10:00");

  const when: EventWhen = allDay
    ? { allDay: true, startDate: date, endDate: endDate < date ? date : endDate }
    : {
        allDay: false,
        start: seoulInstant(date, from),
        end: seoulInstant(endDate < date ? date : endDate, to),
      };
  const invalid = !title.trim() || (!when.allDay && when.end <= when.start);
  const draft: CalendarEventDraft = { title: title.trim(), description, location: location || null, when };

  async function save() {
    let ok;
    if (mode === "local") {
      ok = event
        ? await run({
            type: "calendar.event.update",
            payload: { eventId: event.id, expectedVersion: event.version, patch: draft },
          })
        : await run({ type: "calendar.event.create", payload: draft });
    } else {
      ok = event
        ? await run(
            {
              type: "calendar.propose",
              payload: {
                kind: "calendar.update",
                calendarEventId: event.id,
                expectedEventVersion: event.version,
                draft,
              },
            },
            { success: "변경 제안을 만들었습니다. 승인하면 반영됩니다." },
          )
        : await run(
            { type: "calendar.propose", payload: { kind: "calendar.create", draft } },
            { success: "제안을 만들었습니다. 승인하면 Google에 추가됩니다." },
          );
    }
    if (ok) onClose();
  }
  async function remove() {
    if (!event) return;
    const ok =
      mode === "local"
        ? await run({
            type: "calendar.event.delete",
            payload: { eventId: event.id, expectedVersion: event.version },
          })
        : await run(
            {
              type: "calendar.propose",
              payload: {
                kind: "calendar.delete",
                calendarEventId: event.id,
                expectedEventVersion: event.version,
              },
            },
            { success: "삭제 제안을 만들었습니다." },
          );
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        mode === "local"
          ? event
            ? "일정 편집"
            : "새 일정"
          : event
            ? "Google 일정 변경 제안"
            : "Google 일정 제안"
      }
      description={
        mode === "propose"
          ? "제안은 승인 전까지 Google에 쓰이지 않습니다. LifeRoute 전용 캘린더에만 씁니다."
          : "LifeRoute에만 저장되는 일정입니다."
      }
      footer={
        <>
          {event ? (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={remove}>
              {mode === "local" ? "삭제" : "삭제 제안"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={invalid}>
            {mode === "local" ? "저장" : "제안 만들기"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="제목">
          {(id) => (
            <TextInput
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              autoFocus
            />
          )}
        </Field>
        <Checkbox checked={allDay} onChange={setAllDay} label="종일" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="종료일">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => e.target.value && setEndDate(e.target.value)}
              />
            )}
          </Field>
          {!allDay ? (
            <>
              <Field label="시작 시각">
                {(id) => (
                  <TextInput id={id} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                )}
              </Field>
              <Field
                label="종료 시각"
                error={!when.allDay && when.end <= when.start ? "종료가 시작보다 늦어야 합니다." : null}
              >
                {(id) => <TextInput id={id} type="time" value={to} onChange={(e) => setTo(e.target.value)} />}
              </Field>
            </>
          ) : null}
        </div>
        <Field label="장소">
          {(id) => (
            <TextInput
              id={id}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <Field label="메모">
          {(id) => (
            <TextArea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
