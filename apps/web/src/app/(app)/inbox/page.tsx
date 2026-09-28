"use client";

import { useRef, useState } from "react";
import {
  Archive,
  FileText,
  ImageIcon,
  Link2,
  ListTodo,
  NotebookPen,
  Receipt as ReceiptIcon,
  Upload,
} from "lucide-react";
import type { InboxItem, Receipt } from "@liferoute/contracts";
import { add, formatKrw, isMoney, monthKey, suggestConfirmed } from "@liferoute/core";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, MoneyInput, TextInput } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { ApiRequestError, uploadCapture } from "@/lib/api-client";
import { useWorkspace } from "@/lib/workspace";
import { instantLabel } from "@/lib/dates";

const KIND_ICON = { text: FileText, url: Link2, image: ImageIcon, receipt: ReceiptIcon } as const;
const SOURCE_LABEL = { web: "웹", share: "공유 시트", shortcut: "단축어", api: "API" } as const;

/** Inbox (FR-007): new → task / note / receipt, or archive. Receipts stay drafts until confirmed. */
export default function InboxPage() {
  const { ws, refresh } = useWorkspace();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<Receipt | null>(null);
  const [uploading, setUploading] = useState(false);
  const fresh = ws.inbox.filter((i) => i.status === "new");
  const drafts = ws.receipts.filter((r) => r.status === "draft");
  const month = monthKey(ws.today);
  const confirmedThisMonth = ws.receipts.filter(
    (r) => r.status === "confirmed" && r.confirmed && monthKey(r.confirmed.date) === month,
  );
  const spending = add("0", ...confirmedThisMonth.map((r) => r.confirmed!.amountKrw));

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", "receipt");
      form.set("file", file);
      await uploadCapture(form);
      await refresh();
      toast.show({ tone: "success", title: "영수증 초안을 만들었습니다." });
    } catch (error) {
      toast.show({
        tone: "danger",
        title: error instanceof ApiRequestError ? error.message : "업로드하지 못했습니다.",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="Inbox"
        description="캡처한 것을 할 일·노트·영수증으로 옮기거나 보관하세요."
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="size-4" aria-hidden /> 영수증 올리기
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="새 항목" description={`${fresh.length}개`} />
          {fresh.length === 0 ? (
            <EmptyState
              title="Inbox가 비었습니다."
              description="빠른 캡처(+)나 iPhone 단축어로 보낸 항목이 여기에 쌓입니다."
            />
          ) : (
            <ul className="divide-y divide-line">
              {fresh.map((item) => (
                <InboxRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="확인할 영수증"
              description="OCR 결과는 초안일 뿐, 직접 확인해야 지출로 기록됩니다."
            />
            {drafts.length === 0 ? (
              <EmptyState title="확인할 영수증이 없습니다." />
            ) : (
              <ul className="divide-y divide-line">
                {drafts.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    {r.attachmentId ? (
                      <img
                        src={`/api/v1/attachments/${r.attachmentId}`}
                        alt="영수증"
                        className="size-12 shrink-0 rounded-lg border border-line object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">
                        {r.fields.merchant.value ?? "가게 미확인"}
                      </p>
                      <p className="text-[12px] text-ink-muted">
                        {r.fields.amount.value ? formatKrw(r.fields.amount.value) : "금액 미확인"} · OCR{" "}
                        {r.ocr.status === "unavailable" ? "사용 안 함" : r.ocr.status}
                      </p>
                    </div>
                    <Button size="sm" variant="subtle" onClick={() => setConfirming(r)}>
                      확인
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader
              title="이번 달 확정 지출"
              description="잔액·순자산에는 영향을 주지 않는 기록입니다."
            />
            <p className="num text-2xl font-bold">{formatKrw(spending)}</p>
            <ul className="mt-2 divide-y divide-line">
              {confirmedThisMonth.slice(0, 8).map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-1.5 text-[13px]">
                  <span className="truncate">
                    {r.confirmed!.date.slice(5)} · {r.confirmed!.merchant}
                    {r.confirmed!.category ? (
                      <span className="text-ink-muted"> · {r.confirmed!.category}</span>
                    ) : null}
                  </span>
                  <span className="num shrink-0 font-semibold">{formatKrw(r.confirmed!.amountKrw)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {confirming ? <ReceiptSheet receipt={confirming} onClose={() => setConfirming(null)} /> : null}
    </>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const { ws, run } = useWorkspace();
  const Icon = KIND_ICON[item.kind];
  const hasFile = !!item.attachmentId;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          {item.text ? <p className="whitespace-pre-wrap break-words text-[15px]">{item.text}</p> : null}
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all text-[14px] text-accent-strong underline"
            >
              {item.url}
            </a>
          ) : null}
          {hasFile ? (
            <img
              src={`/api/v1/attachments/${item.attachmentId}`}
              alt="캡처한 이미지"
              className="mt-1 max-h-40 rounded-lg border border-line"
            />
          ) : null}
          <p className="mt-1 text-[12px] text-ink-subtle">
            {instantLabel(item.capturedAt, ws.today)} · {SOURCE_LABEL[item.source]}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
        <Button
          size="sm"
          variant="subtle"
          onClick={() =>
            run(
              { type: "inbox.convert", payload: { itemId: item.id, target: { type: "task" } } },
              { success: "할 일로 옮겼습니다." },
            )
          }
        >
          <ListTodo className="size-4" aria-hidden /> 할 일
        </Button>
        <Button
          size="sm"
          onClick={() =>
            run(
              { type: "inbox.convert", payload: { itemId: item.id, target: { type: "note" } } },
              { success: "노트로 옮겼습니다." },
            )
          }
        >
          <NotebookPen className="size-4" aria-hidden /> 노트
        </Button>
        {hasFile ? (
          <Button
            size="sm"
            onClick={() =>
              run(
                { type: "inbox.convert", payload: { itemId: item.id, target: { type: "receipt" } } },
                { success: "영수증 초안을 만들었습니다." },
              )
            }
          >
            <ReceiptIcon className="size-4" aria-hidden /> 영수증
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run({ type: "inbox.archive", payload: { itemId: item.id } })}
        >
          <Archive className="size-4" aria-hidden /> 보관
        </Button>
      </div>
    </li>
  );
}

function ReceiptSheet({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const { ws, run } = useWorkspace();
  const suggested = suggestConfirmed(receipt.fields);
  const [merchant, setMerchant] = useState(suggested.merchant ?? "");
  const [amount, setAmount] = useState(suggested.amountKrw ?? "");
  const [amountOk, setAmountOk] = useState(!!suggested.amountKrw);
  const [date, setDate] = useState(suggested.date ?? ws.today);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const valid = merchant.trim() && amountOk && isMoney(amount) && date;

  async function confirm() {
    const ok = await run(
      {
        type: "receipt.confirm",
        payload: {
          receiptId: receipt.id,
          expectedVersion: receipt.version,
          confirmed: {
            merchant: merchant.trim(),
            amountKrw: amount,
            date,
            category: category.trim() || null,
            memo: memo.trim() || null,
          },
        },
      },
      { success: "지출로 기록했습니다." },
    );
    if (ok) onClose();
  }
  async function discard() {
    if (
      await run({
        type: "receipt.discard",
        payload: { receiptId: receipt.id, expectedVersion: receipt.version },
      })
    )
      onClose();
  }

  const field = (key: keyof Receipt["fields"]) => {
    const f = receipt.fields[key];
    return f.source === "ocr" ? (
      <Badge tone="info">OCR {Math.round((f.confidence ?? 0) * 100)}%</Badge>
    ) : null;
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="영수증 확인"
      description="확인한 값만 지출로 기록됩니다. 모르는 값은 추측하지 마세요."
      wide
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-danger" onClick={discard}>
            버리기
          </Button>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!valid}>
            확정
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {receipt.attachmentId ? (
          <a
            href={`/api/v1/attachments/${receipt.attachmentId}`}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <img
              src={`/api/v1/attachments/${receipt.attachmentId}`}
              alt="영수증 원본"
              className="max-h-[60vh] w-full rounded-lg border border-line object-contain"
            />
          </a>
        ) : null}
        <div className="space-y-3">
          {receipt.ocr.status === "unavailable" ? (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-muted">
              글자 인식(OCR)이 설정되지 않아 직접 입력합니다.
            </p>
          ) : null}
          <Field label="가게">
            {(id) => (
              <>
                <TextInput
                  id={id}
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  maxLength={200}
                />{" "}
                {field("merchant")}
              </>
            )}
          </Field>
          <Field label="금액 (원)" error={amount && !amountOk ? "숫자만 입력하세요." : null}>
            {(id, hint) => (
              <MoneyInput
                id={id}
                aria-describedby={hint}
                value={amount}
                maxFractionDigits={0}
                onChange={(v, ok) => {
                  setAmount(v);
                  setAmountOk(ok);
                }}
              />
            )}
          </Field>
          <Field label="날짜">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={date}
                max={ws.today}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="분류 (선택)">
            {(id) => (
              <TextInput
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={50}
                placeholder="예: 식비, 교통"
              />
            )}
          </Field>
          <Field label="메모 (선택)">
            {(id) => (
              <TextInput id={id} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />
            )}
          </Field>
          {receipt.ocr.rawText ? (
            <details className="text-[12px] text-ink-muted">
              <summary className="cursor-pointer">OCR 원문</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{receipt.ocr.rawText}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
