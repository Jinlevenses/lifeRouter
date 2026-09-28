"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Download, ExternalLink, KeyRound, Plug, Trash2 } from "lucide-react";
import type { Connection, GuidanceSource, Settings } from "@liferoute/contracts";
import { GUIDANCE_ALLOWED_HOSTS } from "@liferoute/contracts";
import { addMonths, formatKrw, isMoney } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Checkbox, Field, MoneyInput, Select, TextArea, TextInput } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { useWorkspace } from "@/lib/workspace";
import type { CommandRequestBody } from "@/lib/api-client";
import { instantLabel } from "@/lib/dates";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}

function SettingsView() {
  const params = useSearchParams();
  const toast = useToast();
  useEffect(() => {
    const g = params.get("google");
    if (!g) return;
    const messages: Record<string, string> = {
      connected: "Google 캘린더를 연결했습니다. 첫 동기화가 곧 시작됩니다.",
      "not-configured": "서버에 GOOGLE_CLIENT_ID/SECRET이 설정되지 않았습니다.",
      "state-mismatch": "연결 확인에 실패했습니다. 다시 시도하세요.",
      denied: "Google 연결을 취소했습니다.",
      failed: "Google 연결에 실패했습니다.",
    };
    toast.show({ tone: g === "connected" ? "success" : "warn", title: messages[g] ?? g });
  }, [params, toast]);
  return (
    <>
      <PageHeader title="설정" description="모든 연동은 직접 설정하기 전까지 꺼져 있습니다." />
      <div className="grid gap-4 lg:grid-cols-2">
        <GoalSettings />
        <CaptureTokens />
        <Connections />
        <AiSettings />
        <BackupSettings />
        <Guidance />
      </div>
    </>
  );
}

type SettingsPatch = Extract<CommandRequestBody, { type: "settings.update" }>["payload"]["patch"];

function useSettingsSave() {
  const { ws, run } = useWorkspace();
  return (patch: SettingsPatch) =>
    run(
      { type: "settings.update", payload: { expectedVersion: ws.settings.version, patch } },
      { success: "설정을 저장했습니다." },
    );
}

function GoalSettings() {
  const { ws } = useWorkspace();
  const save = useSettingsSave();
  const f = ws.settings.finance;
  const [amount, setAmount] = useState(f.goalAmountKrw);
  const [amountOk, setAmountOk] = useState(true);
  const [start, setStart] = useState(f.goalStartDate);
  const [target, setTarget] = useState(f.goalTargetDate);
  const [stale, setStale] = useState(String(f.staleAfterDays));
  return (
    <Card>
      <CardHeader title="순자산 목표" description="기본값: 1억 원, 처음 실행한 날부터 36개월" />
      <div className="space-y-3">
        <Field label="목표 금액">
          {(id) => (
            <MoneyInput
              id={id}
              value={amount}
              maxFractionDigits={0}
              onChange={(v, ok) => {
                setAmount(v);
                setAmountOk(ok);
              }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일">
            {(id) => (
              <TextInput id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            )}
          </Field>
          <Field
            label="목표일"
            hint={
              <button type="button" className="underline" onClick={() => setTarget(addMonths(start, 36))}>
                시작 + 36개월
              </button>
            }
          >
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={target}
                min={start}
                onChange={(e) => setTarget(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="잔액이 오래됐다고 볼 기간 (일)"
          hint="이보다 오래된 잔액은 ‘오래됨’으로 표시되고 합계가 불완전해집니다."
        >
          {(id, hint) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={365}
              value={stale}
              onChange={(e) => setStale(e.target.value)}
              aria-describedby={hint}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!amountOk || !isMoney(amount) || !start || !target || target <= start}
            onClick={() =>
              save({
                finance: {
                  goalAmountKrw: amount,
                  goalStartDate: start,
                  goalTargetDate: target,
                  staleAfterDays: Math.max(1, Math.min(365, Number(stale) || 35)),
                },
              })
            }
          >
            저장
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CaptureTokens() {
  const { ws, run } = useWorkspace();
  const toast = useToast();
  const [label, setLabel] = useState("iPhone");
  const [secret, setSecret] = useState<string | null>(null);
  const endpoint =
    typeof window !== "undefined" ? `${window.location.origin}/api/v1/capture` : "/api/v1/capture";
  const active = ws.apiTokens.filter((t) => !t.revokedAt);
  async function create() {
    const result = await run({
      type: "token.create",
      payload: { label: label.trim() || "iPhone", scope: "capture" },
    });
    if (result) setSecret(result.secret);
  }
  return (
    <Card>
      <CardHeader
        title="iPhone 캡처 토큰"
        description="공유 시트·단축어에서 Inbox로 보낼 때 쓰는 전용 키 (캡처만 가능)"
      />
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label="이름" className="flex-1">
          {(id) => (
            <TextInput id={id} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} />
          )}
        </Field>
        <Button type="submit">
          <KeyRound className="size-4" aria-hidden /> 발급
        </Button>
      </form>
      {active.length ? (
        <ul className="mt-3 divide-y divide-line">
          {active.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-semibold">{t.label}</span>{" "}
                <code className="font-mono text-[12px] text-ink-muted">{t.prefix}…</code>
                <span className="block text-[12px] text-ink-muted">
                  {t.lastUsedAt ? `마지막 사용 ${instantLabel(t.lastUsedAt, ws.today)}` : "아직 사용 안 함"}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() =>
                  window.confirm(`${t.label} 토큰을 폐기할까요?`) &&
                  run({ type: "token.revoke", payload: { tokenId: t.id } })
                }
              >
                폐기
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Sheet
        open={!!secret}
        onOpenChange={(o) => !o && setSecret(null)}
        title="토큰이 발급되었습니다"
        description="이 값은 지금 한 번만 보입니다. 단축어에 붙여 넣은 뒤 닫으세요."
        wide
      >
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 rounded-lg bg-canvas p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{secret}</code>
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(secret ?? "");
                toast.show({ tone: "success", title: "복사했습니다." });
              }}
            >
              <Copy className="size-4" aria-hidden /> 복사
            </Button>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
            <li>단축어 앱 → 새 단축어 → ‘URL의 콘텐츠 가져오기’ 동작을 추가합니다.</li>
            <li>
              URL: <code className="break-all font-mono">{endpoint}</code>, 방법: POST
            </li>
            <li>
              헤더: <code className="font-mono">Authorization</code> ={" "}
              <code className="font-mono">Bearer (위 토큰)</code>
            </li>
            <li>
              본문(양식): <code className="font-mono">kind</code>=text/url/image/receipt,{" "}
              <code className="font-mono">text</code> 또는 <code className="font-mono">url</code>, 이미지는{" "}
              <code className="font-mono">file</code>
            </li>
            <li>설정에서 ‘공유 시트에서 보기’를 켜면 사진·링크를 바로 보낼 수 있습니다.</li>
          </ol>
          <p className="text-[12px] text-ink-muted">
            토큰은 이 서비스 안에서만 쓰이며, 잃어버렸다면 폐기하고 새로 발급하세요. 실제 iPhone 동작은 직접
            확인이 필요합니다.
          </p>
        </div>
      </Sheet>
    </Card>
  );
}

const STATUS_LABEL: Record<Connection["status"], string> = {
  disconnected: "미연결",
  connected: "연결됨",
  reauth_required: "재로그인 필요",
  stale: "동기화 지연",
  failed: "실패",
};

function Connections() {
  const { ws, run } = useWorkspace();
  const google = ws.connections.find((c) => c.provider === "google");
  const toss = ws.connections.find((c) => c.provider === "toss");
  return (
    <Card id="connections">
      <CardHeader
        title="연결"
        description="외부 계정은 필요할 때만 연결합니다. 비밀 값은 서버 밖으로 나오지 않습니다."
      />
      <ul className="space-y-3 text-sm">
        <li className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Google 캘린더</p>
            <Badge
              tone={
                google?.status === "connected"
                  ? "accent"
                  : google?.status === "disconnected"
                    ? "neutral"
                    : "warn"
              }
            >
              {STATUS_LABEL[google?.status ?? "disconnected"]}
            </Badge>
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">
            모든 캘린더를 읽고, 승인한 일정만 별도의 ‘LifeRoute’ 캘린더에 씁니다. Notion Calendar 일정은
            Google에 연결되어 있다면 함께 읽힙니다.
          </p>
          {google?.lastError ? <p className="mt-1 text-[12px] text-danger">{google.lastError}</p> : null}
          {google?.lastSuccessAt ? (
            <p className="mt-1 text-[12px] text-ink-muted">
              마지막 동기화 {instantLabel(google.lastSuccessAt, ws.today)}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {google?.status === "connected" ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    run(
                      { type: "connection.syncNow", payload: { provider: "google" } },
                      { success: "동기화를 요청했습니다." },
                    )
                  }
                >
                  지금 동기화
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() =>
                    window.confirm("Google 연결을 해제할까요?") &&
                    run({ type: "connection.disconnect", payload: { provider: "google" } })
                  }
                >
                  연결 해제
                </Button>
              </>
            ) : (
              <a
                href="/api/v1/auth/google"
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-2.5 text-[13px] font-semibold text-white hover:bg-accent-strong"
              >
                <Plug className="size-4" aria-hidden /> Google 연결
              </a>
            )}
          </div>
        </li>
        <li className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Toss 잔액 (읽기 전용)</p>
            <Badge>{STATUS_LABEL[toss?.status ?? "disconnected"]}</Badge>
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">
            공식 읽기 전용 API와 계약 키·허용 IP가 확인되기 전까지는 잔액을 직접 기록합니다. 실패해도 기존
            잔액을 덮어쓰지 않습니다.
          </p>
        </li>
        <li className="rounded-xl border border-line p-3">
          <p className="font-semibold">은행</p>
          <p className="mt-1 text-[12px] text-ink-muted">
            공식 API 전까지 자산 화면에서 수동 스냅샷으로 기록합니다.
          </p>
        </li>
      </ul>
    </Card>
  );
}

const MODEL_PRICES: Record<string, { input: string; output: string }> = {
  // KRW per 1M tokens at 1,400 KRW/USD from published USD prices; edit if the rate or price changes.
  "claude-opus-5": { input: "7000", output: "35000" },
  "claude-sonnet-5": { input: "2800", output: "14000" },
  "claude-haiku-4-5": { input: "1400", output: "7000" },
};

function AiSettings() {
  const { ws } = useWorkspace();
  const save = useSettingsSave();
  const ai = ws.settings.ai;
  const [provider, setProvider] = useState<Settings["ai"]["provider"]>(ai.provider);
  const [model, setModel] = useState(ai.model ?? "claude-opus-5");
  const [budget, setBudget] = useState(ai.monthlyBudgetKrw);
  const [input, setInput] = useState(ai.inputKrwPer1MTokens ?? "");
  const [output, setOutput] = useState(ai.outputKrwPer1MTokens ?? "");
  const [maxOut, setMaxOut] = useState(String(ai.maxOutputTokens));
  const valid = isMoney(budget) && (provider === "disconnected" || (isMoney(input) && isMoney(output)));
  return (
    <Card>
      <CardHeader
        title="AI 분석"
        description={`월 예산 ${formatKrw(ai.monthlyBudgetKrw)} · 이번 달 남음 ${formatKrw(ws.aiBudget.remainingKrw)}`}
      />
      <div className="space-y-3">
        <Field label="제공자" hint="API 키는 서버의 ANTHROPIC_API_KEY 환경 변수로만 설정합니다.">
          {(id, hint) => (
            <Select
              id={id}
              value={provider}
              onChange={(e) => setProvider(e.target.value as Settings["ai"]["provider"])}
              aria-describedby={hint}
            >
              <option value="disconnected">사용 안 함</option>
              <option value="anthropic">Anthropic Claude</option>
            </Select>
          )}
        </Field>
        {provider === "anthropic" ? (
          <>
            <Field label="모델">
              {(id) => (
                <Select
                  id={id}
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    const p = MODEL_PRICES[e.target.value];
                    if (p) {
                      setInput(p.input);
                      setOutput(p.output);
                    }
                  }}
                >
                  <option value="claude-opus-5">claude-opus-5 (기본)</option>
                  <option value="claude-sonnet-5">claude-sonnet-5</option>
                  <option value="claude-haiku-4-5">claude-haiku-4-5 (저렴)</option>
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="입력 단가 (원/100만 토큰)">
                {(id) => (
                  <MoneyInput id={id} value={input} maxFractionDigits={2} onChange={(v) => setInput(v)} />
                )}
              </Field>
              <Field label="출력 단가 (원/100만 토큰)">
                {(id) => (
                  <MoneyInput id={id} value={output} maxFractionDigits={2} onChange={(v) => setOutput(v)} />
                )}
              </Field>
            </div>
            <Field label="최대 출력 토큰" hint="비용 상한 계산에 쓰입니다.">
              {(id, hint) => (
                <TextInput
                  id={id}
                  type="number"
                  min={100}
                  max={20000}
                  value={maxOut}
                  onChange={(e) => setMaxOut(e.target.value)}
                  aria-describedby={hint}
                />
              )}
            </Field>
          </>
        ) : null}
        <Field label="월 예산 (원)">
          {(id) => <MoneyInput id={id} value={budget} maxFractionDigits={0} onChange={(v) => setBudget(v)} />}
        </Field>
        <p className="text-[12px] text-ink-muted">
          예산 계산은 추정치 기준 차단입니다. 실제 청구액은 월말에 청구서와 대조하세요.
        </p>
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              save({
                ai: {
                  provider,
                  model,
                  monthlyBudgetKrw: budget,
                  inputKrwPer1MTokens: provider === "disconnected" ? ai.inputKrwPer1MTokens : input,
                  outputKrwPer1MTokens: provider === "disconnected" ? ai.outputKrwPer1MTokens : output,
                  maxOutputTokens: Math.max(100, Math.min(20000, Number(maxOut) || 2000)),
                },
              })
            }
          >
            저장
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BackupSettings() {
  const { ws, run } = useWorkspace();
  const save = useSettingsSave();
  const b = ws.settings.backup;
  const [enabled, setEnabled] = useState(b.enabled);
  const [dailyAt, setDailyAt] = useState(b.dailyAt);
  return (
    <Card>
      <CardHeader title="백업·내보내기" description="매일 암호화 백업 · 보존 7일/4주/12개월" />
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-canvas p-3">
          <p>
            마지막 백업:{" "}
            {ws.ops.lastBackupAt ? (
              <strong>{instantLabel(ws.ops.lastBackupAt, ws.today)}</strong>
            ) : (
              <strong>없음</strong>
            )}
            {ws.ops.lastBackupOk === false ? (
              <Badge tone="danger" className="ml-1">
                최근 실패
              </Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            백그라운드 작업기:{" "}
            {ws.ops.workerAlive ? "동작 중" : "꺼짐 — `pnpm worker`를 실행해야 백업·동기화가 돕니다"}
          </p>
        </div>
        <Checkbox checked={enabled} onChange={setEnabled} label="매일 자동 백업" />
        <Field label="백업 시각 (서울)">
          {(id) => (
            <TextInput id={id} type="time" value={dailyAt} onChange={(e) => setDailyAt(e.target.value)} />
          )}
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => run({ type: "backup.runNow", payload: {} }, { success: "백업을 요청했습니다." })}
          >
            지금 백업
          </Button>
          <Button variant="primary" onClick={() => save({ backup: { enabled, dailyAt } })}>
            저장
          </Button>
        </div>
        <div className="border-t border-line pt-3">
          <a
            href="/api/v1/export"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline"
          >
            <Download className="size-4" aria-hidden /> 전체 내보내기 (JSON + Markdown + 첨부, zip)
          </a>
          <p className="mt-1 text-[12px] text-ink-muted">
            비밀번호·토큰은 포함되지 않습니다. 복구 훈련과 외부 매체 보관은 직접 해야 합니다
            (docs/11_operations).
          </p>
        </div>
      </div>
    </Card>
  );
}

function Guidance() {
  const { ws } = useWorkspace();
  const [editing, setEditing] = useState<GuidanceSource | null | undefined>(undefined);
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="생활·근로·세무 안내 출처"
        description="공공·공식 출처만 저장합니다 (고용노동부, 국세청, 찾기쉬운 생활법령). 개인 판단을 자동화하지 않습니다."
        action={
          <Button size="sm" onClick={() => setEditing(null)}>
            추가
          </Button>
        }
      />
      {ws.guidance.length === 0 ? (
        <EmptyState
          title="저장한 안내가 없습니다."
          description="예: 연말정산 공제 항목(국세청), 연차 계산(고용노동부)"
        />
      ) : (
        <ul className="divide-y divide-line">
          {ws.guidance.map((g) => (
            <li key={g.id} className="flex items-start gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left font-semibold hover:text-accent-strong"
                  onClick={() => setEditing(g)}
                >
                  {g.title}
                </button>
                <p className="text-[12px] text-ink-muted">
                  확인일 {g.checkedAt}
                  {g.effectiveDate ? ` · 시행일 ${g.effectiveDate}` : ""} · 해당 여부: 알 수 없음
                </p>
                {g.summary ? <p className="mt-0.5 text-[13px]">{g.summary}</p> : null}
              </div>
              <a
                href={g.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-accent-strong"
                aria-label={`${g.title} 원문 열기`}
              >
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <GuidanceEditor key={editing?.id ?? "new"} source={editing} onClose={() => setEditing(undefined)} />
      ) : null}
    </Card>
  );
}

function GuidanceEditor({ source, onClose }: { source: GuidanceSource | null; onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const [title, setTitle] = useState(source?.title ?? "");
  const [url, setUrl] = useState(source?.sourceUrl ?? "https://www.nts.go.kr/");
  const [topic, setTopic] = useState<GuidanceSource["topic"]>(source?.topic ?? "tax");
  const [checkedAt, setCheckedAt] = useState(source?.checkedAt ?? ws.today);
  const [effectiveDate, setEffectiveDate] = useState(source?.effectiveDate ?? "");
  const [summary, setSummary] = useState(source?.summary ?? "");
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const allowed = (GUIDANCE_ALLOWED_HOSTS as readonly string[]).includes(host);
  async function save() {
    const ok = await run({
      type: "guidance.upsert",
      payload: {
        id: source?.id,
        expectedVersion: source?.version,
        topic,
        title,
        sourceUrl: url,
        checkedAt,
        effectiveDate: effectiveDate || null,
        summary,
      },
    });
    if (ok) onClose();
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={source ? "안내 편집" : "안내 추가"}
      footer={
        <>
          {source ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              onClick={async () =>
                (await run({
                  type: "guidance.delete",
                  payload: { guidanceId: source.id, expectedVersion: source.version },
                })) && onClose()
              }
            >
              <Trash2 className="size-4" aria-hidden /> 삭제
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !allowed}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="제목">
          {(id) => (
            <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          )}
        </Field>
        <Field
          label="출처 URL"
          error={url && !allowed ? `허용된 출처: ${GUIDANCE_ALLOWED_HOSTS.join(", ")}` : null}
        >
          {(id, hint) => (
            <TextInput
              id={id}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby={hint}
            />
          )}
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="분야">
            {(id) => (
              <Select
                id={id}
                value={topic}
                onChange={(e) => setTopic(e.target.value as GuidanceSource["topic"])}
              >
                <option value="labor">근로</option>
                <option value="tax">세무</option>
                <option value="life">생활</option>
                <option value="other">기타</option>
              </Select>
            )}
          </Field>
          <Field label="확인일">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={checkedAt}
                onChange={(e) => setCheckedAt(e.target.value)}
              />
            )}
          </Field>
          <Field label="시행일">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="요약">
          {(id) => (
            <TextArea
              id={id}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              maxLength={4000}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
