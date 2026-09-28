"use client";

import { useMemo, useState } from "react";
import { Bot, CalendarRange, Lock, RefreshCw } from "lucide-react";
import clsx from "clsx";
import type { Analysis, CostEstimate, Review } from "@liferoute/contracts";
import { formatDateKo, formatKrw, periodContaining } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Checkbox, Field, TextArea, TextInput } from "@/components/ui/fields";
import { useWorkspace } from "@/lib/workspace";
import { instantLabel } from "@/lib/dates";

/** 검토 (FR-009): deterministic weekly/monthly aggregation; AI only on explicitly consented notes. */
export default function ReviewsPage() {
  const { ws, run } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(ws.reviews[0]?.id ?? null);
  const [pastDate, setPastDate] = useState("");
  const review = ws.reviews.find((r) => r.id === selected) ?? ws.reviews[0] ?? null;
  const weekKey = periodContaining("weekly", ws.today).key;
  const monthKeyNow = periodContaining("monthly", ws.today).key;

  async function generate(kind: "weekly" | "monthly", date = ws.today) {
    const result = await run(
      { type: "review.generate", payload: { kind, date } },
      { success: "검토를 만들었습니다." },
    );
    if (result) setSelected(result.review.id);
  }

  return (
    <>
      <PageHeader
        title="검토"
        description="같은 기록이면 언제 만들어도 같은 결과가 나옵니다. 내가 쓴 회고는 다시 만들어도 지워지지 않습니다."
        action={
          <>
            <Button onClick={() => generate("weekly")}>
              <CalendarRange className="size-4" aria-hidden /> 이번 주
            </Button>
            <Button variant="primary" onClick={() => generate("monthly")}>
              <CalendarRange className="size-4" aria-hidden /> 이번 달
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label="검토 목록">
          <Card className="!p-3">
            {ws.reviews.length === 0 ? (
              <p className="p-1 text-[13px] text-ink-muted">아직 검토가 없습니다.</p>
            ) : (
              <ul className="space-y-0.5">
                {ws.reviews.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-current={review?.id === r.id ? "true" : undefined}
                      onClick={() => setSelected(r.id)}
                      className={clsx(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                        review?.id === r.id
                          ? "bg-accent-soft font-semibold text-accent-strong"
                          : "hover:bg-canvas",
                      )}
                    >
                      <span>{labelFor(r)}</span>
                      {r.status === "finalized" ? (
                        <Lock className="size-3.5 text-ink-subtle" aria-label="확정됨" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-3">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (pastDate) void generate("weekly", pastDate);
              }}
            >
              <Field label="지난 주 검토" className="flex-1">
                {(id) => (
                  <TextInput
                    id={id}
                    type="date"
                    max={ws.today}
                    value={pastDate}
                    onChange={(e) => setPastDate(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" size="sm" disabled={!pastDate}>
                만들기
              </Button>
            </form>
          </Card>
        </aside>
        <div className="min-w-0 space-y-4">
          {review ? (
            <ReviewDetail
              key={`${review.id}:${review.version}`}
              review={review}
              current={review.key === weekKey || review.key === monthKeyNow}
            />
          ) : (
            <EmptyState
              title="검토를 만들어 보세요."
              description="완료한 일, 루틴 달성, 순자산 변화, 기한 지난 일을 모아 보여 줍니다."
            />
          )}
          <AiAnalysis />
        </div>
      </div>
    </>
  );
}

function labelFor(r: Review): string {
  if (r.kind === "monthly") return `${Number(r.periodStart.slice(5, 7))}월 (${r.periodStart.slice(0, 4)})`;
  return `${formatDateKo(r.periodStart, false)} 주`;
}

function ReviewDetail({ review, current }: { review: Review; current: boolean }) {
  const { ws, run } = useWorkspace();
  const [owner, setOwner] = useState(review.owner);
  const c = review.computed;
  const tasksById = useMemo(() => new Map(ws.tasks.map((t) => [t.id, t.title])), [ws.tasks]);
  const routineName = (id: string) => ws.routines.find((r) => r.id === id)?.title ?? "삭제된 루틴";
  const locked = review.status === "finalized";
  const dirty = JSON.stringify(owner) !== JSON.stringify(review.owner);

  return (
    <>
      <Card>
        <CardHeader
          title={`${review.kind === "weekly" ? "주간" : "월간"} 검토 · ${review.periodStart} ~ ${review.periodEnd}`}
          description={`생성 ${instantLabel(review.generatedAt, ws.today)}${locked ? " · 확정됨" : ""}`}
          action={
            !locked ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(
                      {
                        type: "review.generate",
                        payload: {
                          kind: review.kind,
                          date: review.periodEnd > ws.today ? ws.today : review.periodEnd,
                        },
                      },
                      { success: "최신 기록으로 다시 계산했습니다." },
                    )
                  }
                >
                  <RefreshCw className="size-4" aria-hidden /> 다시 계산
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    run({
                      type: "review.finalize",
                      payload: { reviewId: review.id, expectedVersion: review.version },
                    })
                  }
                  disabled={current || dirty}
                  title={current ? "기간이 끝난 뒤 확정할 수 있습니다" : undefined}
                >
                  확정
                </Button>
              </>
            ) : null
          }
        />
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="완료한 할 일" value={`${c.completedTasks.count}개`} />
          <Stat
            label="기한 지난 할 일"
            value={`${c.overdueTasks.count}개`}
            tone={c.overdueTasks.count ? "warn" : undefined}
          />
          <Stat
            label="순자산 변화"
            value={
              c.netWorth.deltaKrw === null
                ? "기록 부족"
                : `${c.netWorth.deltaKrw.startsWith("-") ? "" : "+"}${formatKrw(c.netWorth.deltaKrw)}`
            }
            tone={c.netWorth.incomplete ? "warn" : undefined}
          />
          <Stat label="확정 지출" value={formatKrw(c.spendingKrw)} />
        </dl>
        {c.netWorth.incomplete ? (
          <p className="mt-2 text-[12px] text-warn">
            잔액 기록이 없거나 오래된 계좌가 있어 순자산 변화가 정확하지 않을 수 있습니다.
          </p>
        ) : null}
        {c.routines.length ? (
          <div className="mt-4">
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink-muted">루틴</h3>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>루틴</th>
                  <th>달성</th>
                  <th>건너뜀</th>
                  <th>미기록</th>
                </tr>
              </thead>
              <tbody>
                {c.routines.map((r) => (
                  <tr key={r.routineId} className="border-t border-line">
                    <td className="py-1.5">{routineName(r.routineId)}</td>
                    <td className="num py-1.5 text-right font-semibold">
                      {r.done}/{r.expected}
                    </td>
                    <td className="num py-1.5 text-right text-ink-muted">건너뜀 {r.skipped}</td>
                    <td className="num py-1.5 text-right text-ink-muted">미기록 {r.unrecorded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {c.overdueTasks.taskIds.length ? (
          <div className="mt-4">
            <h3 className="mb-1 text-[13px] font-semibold text-ink-muted">기한 지난 할 일</h3>
            <ul className="list-disc pl-5 text-sm">
              {c.overdueTasks.taskIds.slice(0, 10).map((id) => (
                <li key={id}>{tasksById.get(id) ?? "(목록 밖 할 일)"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-[12px] text-ink-subtle">
          노트 {c.notesCreated}개 작성 · 루틴 기록 {c.checkInsRecorded}회
        </p>
      </Card>

      <Card>
        <CardHeader
          title="회고"
          description="자동 초안을 참고해 직접 적으세요. 자동 초안은 규칙으로 만든 문장이며 AI가 아닙니다."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["wins", "잘한 것", review.draft.wins],
              ["challenges", "어려웠던 것", review.draft.challenges],
              ["nextFocus", "다음에 집중할 것", review.draft.nextFocus],
            ] as const
          ).map(([key, label, draft]) => (
            <div key={key}>
              <Field label={label}>
                {(id) => (
                  <TextArea
                    id={id}
                    rows={5}
                    value={owner[key]}
                    disabled={locked}
                    onChange={(e) => setOwner({ ...owner, [key]: e.target.value })}
                  />
                )}
              </Field>
              {draft.length ? (
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-ink-muted">
                  {draft.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
        <Field label="메모" className="mt-4">
          {(id) => (
            <TextArea
              id={id}
              rows={3}
              value={owner.notes}
              disabled={locked}
              onChange={(e) => setOwner({ ...owner, notes: e.target.value })}
            />
          )}
        </Field>
        {!locked ? (
          <div className="mt-3 flex justify-end">
            <Button
              variant="primary"
              disabled={!dirty}
              onClick={() =>
                run(
                  {
                    type: "review.update",
                    payload: { reviewId: review.id, expectedVersion: review.version, owner },
                  },
                  { success: "회고를 저장했습니다." },
                )
              }
            >
              회고 저장
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg bg-canvas p-2.5">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className={clsx("num mt-0.5 font-bold", tone === "warn" && "text-warn")}>{value}</dd>
    </div>
  );
}

const ANALYSIS_STATUS: Record<Analysis["status"], string> = {
  previewed: "동의 대기",
  consented: "동의함",
  queued: "대기열",
  running: "분석 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
};

/** Consent-gated AI analysis (docs/15_ai): preview (notes, purpose, cost, remaining) → explicit consent → run. */
function AiAnalysis() {
  const { ws } = useWorkspace();
  const [open, setOpen] = useState(false);
  const budget = ws.aiBudget;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <Bot className="size-4 text-accent" aria-hidden /> AI 분석 (선택)
          </span>
        }
        description={`이번 달 예산 ${formatKrw(budget.budgetKrw)} · 사용 ${formatKrw(budget.usedKrw)} · 예약 ${formatKrw(budget.reservedKrw)} · 남음 ${formatKrw(budget.remainingKrw)}`}
        action={
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            disabled={!budget.configured}
            title={budget.configured ? undefined : "설정 > AI에서 먼저 설정하세요"}
          >
            새 분석
          </Button>
        }
      />
      {!budget.configured ? (
        <p className="text-[13px] text-ink-muted">
          AI는 꺼져 있습니다. 설정에서 제공자·단가를 입력하고 서버에 API 키를 둔 경우에만, 고른 노트만 보내
          분석합니다. 재무·일정은 AI가 바꾸지 않습니다.
        </p>
      ) : null}
      {ws.analyses.length ? (
        <ul className="mt-2 divide-y divide-line">
          {ws.analyses.slice(0, 10).map((a) => (
            <AnalysisRow key={a.id} analysis={a} />
          ))}
        </ul>
      ) : null}
      {open ? <AnalysisSheet onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function AnalysisRow({ analysis }: { analysis: Analysis }) {
  const { ws, run } = useWorkspace();
  const [consent, setConsent] = useState(false);
  // When notes changed since the preview, the server returns a fresh estimate; consent must be given again.
  const [refreshed, setRefreshed] = useState<CostEstimate | null>(null);
  const estimate = refreshed ?? analysis.estimate;
  const cost = estimate?.costKrw ?? "0";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{analysis.purpose}</p>
        <Badge
          tone={
            analysis.status === "completed" ? "accent" : analysis.status === "failed" ? "danger" : "neutral"
          }
        >
          {ANALYSIS_STATUS[analysis.status]}
        </Badge>
      </div>
      <p className="text-[12px] text-ink-muted">
        노트 {analysis.noteIds.length}개 · 예상 {formatKrw(cost)} ·{" "}
        {instantLabel(analysis.createdAt, ws.today)}
      </p>
      {analysis.status === "previewed" ? (
        <div className="mt-2 space-y-2 rounded-lg bg-canvas p-3">
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label={`선택한 노트 ${analysis.noteIds.length}개의 원문을 AI(${analysis.model ?? ""})에 보내는 것에 동의합니다.`}
            description={`예상 비용 ${formatKrw(cost)} · 이번 달 남은 예산 ${formatKrw(estimate?.remainingKrw ?? "0")}`}
          />
          {refreshed ? (
            <p className="text-[12px] font-semibold text-warn">
              노트가 바뀌어 예상 비용이 {formatKrw(cost)}으로 다시 계산되었습니다. 다시 확인해 주세요.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!consent}
              onClick={() =>
                run(
                  {
                    type: "analysis.execute",
                    payload: {
                      analysisId: analysis.id,
                      expectedVersion: analysis.version,
                      consent: true,
                      consentEstimateKrw: cost,
                    },
                  },
                  {
                    success: "분석을 요청했습니다.",
                    onError: (e) => {
                      if (e.code !== "AI_CONSENT_STALE") return false;
                      setRefreshed((e.details as { estimate: CostEstimate }).estimate);
                      setConsent(false);
                      return true;
                    },
                  },
                )
              }
            >
              동의하고 실행
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                run({
                  type: "analysis.cancel",
                  payload: { analysisId: analysis.id, expectedVersion: analysis.version },
                })
              }
            >
              취소
            </Button>
          </div>
        </div>
      ) : null}
      {analysis.resultText ? (
        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{analysis.resultText}</div>
      ) : null}
      {analysis.error ? <p className="mt-1 text-[12px] text-danger">{analysis.error}</p> : null}
    </li>
  );
}

function AnalysisSheet({ onClose }: { onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const [purpose, setPurpose] = useState("");
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const toggle = (id: string) =>
    setNoteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 50)));
  async function preview() {
    const result = await run({ type: "analysis.preview", payload: { purpose, noteIds } });
    if (result) onClose();
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="AI 분석 미리보기"
      description="보낼 노트와 목적을 고르면 예상 비용을 먼저 보여 줍니다. 아직 아무것도 보내지 않습니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" disabled={!purpose.trim() || noteIds.length === 0} onClick={preview}>
            예상 비용 보기
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="분석 목적">
          {(id) => (
            <TextInput
              id={id}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              maxLength={500}
              placeholder="예: 이번 달 일기에서 반복되는 고민 정리"
            />
          )}
        </Field>
        <fieldset>
          <legend className="label">보낼 노트 ({noteIds.length})</legend>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {ws.notes.map((n) => (
              <li key={n.id}>
                <Checkbox
                  checked={noteIds.includes(n.id)}
                  onChange={() => toggle(n.id)}
                  label={n.title || "제목 없음"}
                  description={n.excerpt.slice(0, 60)}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Sheet>
  );
}
