"use client";

import { useMemo, useState } from "react";
import { History, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  type Account,
  type AccountCategory,
  type BalanceSnapshot,
} from "@liferoute/contracts";
import { formatAmount, formatKrw, formatKrwCompact, goalPercent, isMoney } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/segmented";
import { GoalRing } from "@/components/app/goal-ring";
import { Sheet } from "@/components/app/dialog";
import { Checkbox, Field, MoneyInput, Select, TextArea, TextInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";
import { CATEGORY_LABEL } from "@/lib/labels";

/** 자산 (FR-005): manual snapshots, net worth = included assets − all liabilities, liquid subtotal. */
export default function AssetsPage() {
  const { ws } = useWorkspace();
  const [accountEditor, setAccountEditor] = useState<Account | null | undefined>(undefined);
  const [snapshotFor, setSnapshotFor] = useState<Account | null>(null);
  const [historyFor, setHistoryFor] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const nw = ws.netWorth;
  const rows = useMemo(() => new Map(nw.accounts.map((r) => [r.accountId, r])), [nw.accounts]);
  const active = ws.accounts.filter((a) => !a.archivedAt);
  const archived = ws.accounts.filter((a) => a.archivedAt);

  return (
    <>
      <PageHeader
        title="자산"
        description="잔액은 공식 API 연결 전까지 직접 기록한 스냅샷입니다. 국민연금 미래 수급권은 포함하지 않습니다."
        action={
          <Button onClick={() => setAccountEditor(null)}>
            <Plus className="size-4" aria-hidden /> 계좌
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader
            title="순자산"
            description={
              nw.latestAsOf ? `잔액 기준일 ${nw.earliestAsOf} ~ ${nw.latestAsOf}` : "잔액 기록이 없습니다"
            }
          />
          <p className="num text-[30px] font-bold tracking-tight">{formatKrw(nw.netWorthKrw)}</p>
          <dl className="num mt-3 grid grid-cols-3 gap-2 text-[13px]">
            <div className="rounded-lg bg-muted p-2.5">
              <dt className="text-muted-foreground">포함 자산</dt>
              <dd className="mt-0.5 font-semibold">{formatKrwCompact(nw.includedAssetsKrw)}</dd>
            </div>
            <div className="rounded-lg bg-muted p-2.5">
              <dt className="text-muted-foreground">부채 (전액 차감)</dt>
              <dd className="mt-0.5 font-semibold">{formatKrwCompact(nw.liabilitiesKrw)}</dd>
            </div>
            <div className="rounded-lg bg-muted p-2.5">
              <dt className="text-muted-foreground">유동 자산</dt>
              <dd className="mt-0.5 font-semibold">{formatKrwCompact(nw.liquidAssetsKrw)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center gap-4 rounded-xl bg-muted/60 p-3">
            <GoalRing percent={goalPercent(nw.netWorthKrw, nw.goal.amountKrw)} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">
                목표 {formatKrwCompact(nw.goal.amountKrw)} · {nw.goal.targetDate}
                <span className="num ml-1.5 text-primary">
                  {goalPercent(nw.netWorthKrw, nw.goal.amountKrw).toFixed(1)}%
                </span>
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {nw.goal.status === "active"
                  ? `남은 금액 ${formatKrw(nw.goal.gapKrw)} · ${nw.goal.remainingMonths}개월 · 매달 ${formatKrw(nw.goal.monthlyRequiredKrw ?? "0")}`
                  : nw.goal.status === "achieved"
                    ? "목표 달성"
                    : "목표일이 지났습니다"}
              </p>
            </div>
          </div>
          {nw.data === "incomplete" ? (
            <div className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
              <p className="font-semibold">합계가 불완전합니다.</p>
              <ul className="mt-0.5 list-disc pl-4">
                {nw.missingAccountIds.length ? (
                  <li>잔액이 없는 계좌 {nw.missingAccountIds.length}개 (0원으로 계산)</li>
                ) : null}
                {nw.staleAccountIds.length ? (
                  <li>
                    {ws.settings.finance.staleAfterDays}일 넘게 갱신 안 된 계좌 {nw.staleAccountIds.length}개
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {nw.estimatedAccountIds.length ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              추정값이 들어간 계좌 {nw.estimatedAccountIds.length}개
            </p>
          ) : null}
        </Card>

        <div className="space-y-4">
          {(["asset", "liability"] as const).map((kind) => {
            const list = active.filter((a) => a.kind === kind);
            return (
              <Card key={kind}>
                <CardHeader
                  title={kind === "asset" ? "자산 계좌" : "부채"}
                  description={`${list.length}개`}
                />
                {list.length === 0 ? (
                  <EmptyState
                    title={kind === "asset" ? "자산 계좌가 없습니다." : "등록된 부채가 없습니다."}
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {list.map((a) => {
                      const r = rows.get(a.id);
                      return (
                        <li key={a.id} className="flex items-center gap-3 py-2.5">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setAccountEditor(a)}
                          >
                            <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                            <span className="flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
                              {CATEGORY_LABEL[a.category]}
                              {a.institution ? ` · ${a.institution}` : ""}
                              {a.currency !== "KRW" ? ` · ${a.currency}` : ""}
                              {a.kind === "asset" && !a.included ? <Badge>합계 제외</Badge> : null}
                              {a.liquid ? <Badge tone="info">유동</Badge> : null}
                              {r?.missing ? <Badge tone="warn">잔액 없음</Badge> : null}
                              {r?.stale ? <Badge tone="warn">오래됨</Badge> : null}
                              {r?.estimated ? <Badge>추정</Badge> : null}
                            </span>
                          </button>
                          <div className="text-right">
                            <p
                              className={cn(
                                "num text-[15px] font-semibold",
                                kind === "liability" && "text-destructive",
                              )}
                            >
                              {r?.amountKrw
                                ? `${kind === "liability" ? "-" : ""}${formatKrw(r.amountKrw)}`
                                : "—"}
                            </p>
                            <p className="text-[12px] text-muted-foreground">{r?.asOf ?? "기록 없음"}</p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <Button size="sm" variant="soft" onClick={() => setSnapshotFor(a)}>
                              잔액
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`${a.name} 잔액 기록 보기`}
                              onClick={() => setHistoryFor(a)}
                            >
                              <History className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
          {archived.length ? (
            <Card>
              <CardHeader
                title="보관한 계좌"
                description={`${archived.length}개 · 순자산에서 빠짐`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? "접기" : "보기"}
                  </Button>
                }
              />
              {showArchived ? (
                <ul className="divide-y divide-border">
                  {archived.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <button type="button" className="min-w-0 text-left" onClick={() => setAccountEditor(a)}>
                        <span className="block truncate text-[15px] font-medium">{a.name}</span>
                        <span className="text-[12px] text-muted-foreground">사유: {a.archiveReason}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
      {accountEditor !== undefined ? (
        <AccountEditor
          key={accountEditor?.id ?? "new"}
          account={accountEditor}
          onClose={() => setAccountEditor(undefined)}
        />
      ) : null}
      {snapshotFor ? <SnapshotEditor account={snapshotFor} onClose={() => setSnapshotFor(null)} /> : null}
      {historyFor ? <SnapshotHistory account={historyFor} onClose={() => setHistoryFor(null)} /> : null}
    </>
  );
}

function AccountEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { run } = useWorkspace();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(account?.kind ?? "asset");
  const [category, setCategory] = useState<AccountCategory>(account?.category ?? "deposit");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [currency, setCurrency] = useState(account?.currency ?? "KRW");
  const [included, setIncluded] = useState(account?.included ?? true);
  const [liquid, setLiquid] = useState(account?.liquid ?? false);
  const [memo, setMemo] = useState(account?.memo ?? "");
  const [archiveReason, setArchiveReason] = useState("");
  const categories = kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;

  async function save() {
    const ok = account
      ? await run({
          type: "account.update",
          payload: {
            accountId: account.id,
            expectedVersion: account.version,
            patch: {
              name,
              category,
              institution: institution || null,
              memo: memo || null,
              ...(account.kind === "asset" ? { included, liquid } : {}),
            },
          },
        })
      : await run({
          type: "account.create",
          payload: {
            name,
            kind,
            category,
            institution: institution || null,
            currency: currency.toUpperCase(),
            included: kind === "liability" ? true : included,
            liquid: kind === "liability" ? false : liquid,
            memo: memo || null,
          },
        });
    if (ok) onClose();
  }
  async function archive() {
    if (!account) return;
    const ok = account.archivedAt
      ? await run({
          type: "account.restore",
          payload: { accountId: account.id, expectedVersion: account.version },
        })
      : await run({
          type: "account.archive",
          payload: { accountId: account.id, expectedVersion: account.version, reason: archiveReason },
        });
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={account ? "계좌 편집" : "새 계좌"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={!name.trim() || !/^[A-Za-z]{3}$/.test(currency)}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!account ? (
          <Segmented
            label="종류"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCategory(k === "asset" ? "deposit" : "loan");
            }}
            options={[
              { value: "asset", label: "자산" },
              { value: "liability", label: "부채" },
            ]}
            size="default"
            className="w-full"
            itemClassName="flex-1"
          />
        ) : null}
        <Field label="이름">
          {(id) => (
            <TextInput
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="예: 급여 통장"
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="분류">
            {(id) => (
              <Select
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value as AccountCategory)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="통화" hint={account ? "만든 뒤에는 바꿀 수 없습니다." : "예: KRW, USD"}>
            {(id, hint) => (
              <TextInput
                id={id}
                value={currency}
                maxLength={3}
                disabled={!!account}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                aria-describedby={hint}
              />
            )}
          </Field>
        </div>
        <Field label="금융기관 (선택)" hint="토스뱅크·토스증권 계좌는 연결되기 전까지 직접 기록합니다.">
          {(id, hint) => (
            <>
              <TextInput
                id={id}
                list={`${id}-institutions`}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                maxLength={100}
                aria-describedby={hint}
              />
              <datalist id={`${id}-institutions`}>
                <option value="토스뱅크" />
                <option value="토스증권" />
              </datalist>
            </>
          )}
        </Field>
        {kind === "asset" ? (
          <div className="space-y-2.5 rounded-xl bg-muted p-3">
            <Checkbox
              checked={included}
              onChange={setIncluded}
              label="순자산에 포함"
              description="예금·연금 평가액은 포함, 사용 중인 물건 등은 제외할 수 있습니다."
            />
            <Checkbox
              checked={liquid}
              onChange={setLiquid}
              label="유동 자산"
              description="바로 쓸 수 있는 돈 (입출금·현금 등)"
            />
          </div>
        ) : (
          <p className="rounded-xl bg-muted p-3 text-[13px] text-muted-foreground">
            부채는 항상 순자산에서 전액 차감됩니다. 다 갚았다면 사유와 함께 보관하세요.
          </p>
        )}
        <Field label="메모">
          {(id) => (
            <TextArea
              id={id}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          )}
        </Field>
        {account ? (
          <div className="rounded-xl border border-border p-3">
            {account.archivedAt ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-muted-foreground">보관됨 · 사유: {account.archiveReason}</p>
                <Button variant="outline" size="sm" onClick={archive}>
                  복원
                </Button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Field label="보관 사유" className="flex-1">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={archiveReason}
                      onChange={(e) => setArchiveReason(e.target.value)}
                      placeholder="예: 해지, 상환 완료"
                      maxLength={500}
                    />
                  )}
                </Field>
                <Button variant="outline" onClick={archive} disabled={!archiveReason.trim()}>
                  보관
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function SnapshotEditor({ account, onClose }: { account: Account; onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const [asOf, setAsOf] = useState(ws.today);
  const [amount, setAmount] = useState("");
  const [amountOk, setAmountOk] = useState(false);
  const [fxRate, setFxRate] = useState("");
  const [fxOk, setFxOk] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const [reason, setReason] = useState("");
  const [replace, setReplace] = useState(false);
  const foreign = account.currency !== "KRW";
  const valid =
    amountOk &&
    isMoney(amount) &&
    (!foreign || (fxOk && isMoney(fxRate))) &&
    (!estimated || reason.trim()) &&
    asOf <= ws.today;

  async function save() {
    const ok = await run(
      {
        type: "snapshot.add",
        payload: {
          accountId: account.id,
          asOf,
          amount,
          fxRate: foreign ? fxRate : null,
          estimated,
          reason: reason.trim() || null,
          replace,
        },
      },
      {
        onError: (e) => {
          if (e.code === "SNAPSHOT_EXISTS") {
            setReplace(true);
            return false;
          }
        },
        success: "잔액을 기록했습니다.",
      },
    );
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${account.name} 잔액 기록`}
      description={
        account.kind === "liability"
          ? "갚아야 할 금액을 양수로 입력하세요."
          : "그 날짜 기준 평가액을 입력하세요."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={!valid}>
            {replace ? "같은 날짜 교체" : "저장"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="기준일">
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={asOf}
              max={ws.today}
              onChange={(e) => e.target.value && setAsOf(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={`금액 (${account.currency})`}
          error={amount && !amountOk ? "숫자만 입력하세요 (소수 4자리까지)." : null}
        >
          {(id, hint) => (
            <MoneyInput
              id={id}
              aria-describedby={hint}
              value={amount}
              suffix={account.currency === "KRW" ? "원" : account.currency}
              allowNegative={account.kind === "asset"}
              onChange={(v, ok) => {
                setAmount(v);
                setAmountOk(ok);
              }}
            />
          )}
        </Field>
        {foreign ? (
          <Field label={`환율 (1 ${account.currency}당 원)`} hint="평가 기준일의 환율을 직접 입력합니다.">
            {(id, hint) => (
              <MoneyInput
                id={id}
                aria-describedby={hint}
                value={fxRate}
                onChange={(v, ok) => {
                  setFxRate(v);
                  setFxOk(ok);
                }}
              />
            )}
          </Field>
        ) : null}
        <Checkbox
          checked={estimated}
          onChange={setEstimated}
          label="추정값"
          description="정확한 금액을 모를 때. 이유를 남겨야 합니다."
        />
        {estimated ? (
          <Field label="추정 이유">
            {(id) => (
              <TextInput
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="예: 연금 앱 점검 중, 지난달 명세 기준"
              />
            )}
          </Field>
        ) : null}
        {replace ? (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
            이 날짜의 잔액이 이미 있습니다. 한 번 더 누르면 교체합니다.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function SnapshotHistory({ account, onClose }: { account: Account; onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const list = ws.snapshots
    .filter((s) => s.accountId === account.id)
    .sort((a, b) => b.asOf.localeCompare(a.asOf));
  async function remove(s: BalanceSnapshot) {
    if (window.confirm(`${s.asOf} 잔액 기록을 지울까요?`))
      await run({ type: "snapshot.delete", payload: { snapshotId: s.id } });
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`${account.name} 잔액 기록`}>
      {list.length === 0 ? (
        <EmptyState title="기록이 없습니다." />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="num text-[15px] font-semibold">
                  {formatAmount(s.amount)} {s.currency}
                  {s.currency !== "KRW" ? (
                    <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                      ≈ {formatKrw(s.amountKrw)}
                    </span>
                  ) : null}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {s.asOf}
                  {s.fxRate ? ` · 환율 ${formatAmount(s.fxRate)}` : ""}
                  {s.estimated ? ` · 추정: ${s.reason}` : ""}
                  {s.source === "toss_bank"
                    ? " · 토스뱅크"
                    : s.source === "toss_securities"
                      ? " · 토스증권"
                      : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s)}>
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
