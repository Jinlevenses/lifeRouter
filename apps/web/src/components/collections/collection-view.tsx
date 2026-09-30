"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Collection,
  CollectionProperty,
  CollectionRecord,
  CollectionView,
  PropertyType,
  PropertyValue,
} from "@liferoute/contracts";
import {
  compareValues,
  displayString,
  formatAmount,
  formatDateKo,
  isEmptyValue,
  isMoney,
} from "@liferoute/core";
import { Badge, Card, EmptyState } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/app/dialog";
import { Checkbox, Field, MoneyInput, Select, TextInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";

const TYPE_LABEL: Record<PropertyType, string> = {
  text: "텍스트",
  number: "숫자",
  money: "금액",
  date: "날짜",
  checkbox: "체크박스",
  status: "상태",
  select: "선택",
  multiSelect: "다중 선택",
  url: "URL",
  relation: "연결",
};

function label(
  prop: CollectionProperty,
  value: PropertyValue | undefined,
  collectionsById: Map<string, CollectionRecord[]>,
): string {
  if (!value || isEmptyValue(value)) return "";
  const opt = (id: string) => prop.options.find((o) => o.id === id)?.label ?? id;
  switch (value.type) {
    case "status":
      return opt(value.value);
    case "select":
      return value.value ? opt(value.value) : "";
    case "multiSelect":
      return value.value.map(opt).join(", ");
    case "money":
      return `${formatAmount(value.value)} ${value.currency === "KRW" ? "원" : value.currency}`;
    case "date":
      return formatDateKo(value.value);
    case "relation": {
      const records = collectionsById.get(prop.relationCollectionId ?? "") ?? [];
      return value.value.map((id) => titleOf(records.find((r) => r.id === id))).join(", ");
    }
    default:
      return displayString(value);
  }
}

function titleOf(record: CollectionRecord | undefined): string {
  if (!record) return "?";
  const first = Object.values(record.values).find((v) => v.type === "text");
  return first && first.type === "text" ? first.value : "(제목 없음)";
}

function matches(view: CollectionView, record: CollectionRecord): boolean {
  return view.filters.every((f) => {
    const v = record.values[f.propertyId];
    const text = v ? displayString(v).toLowerCase() : "";
    switch (f.op) {
      case "isEmpty":
        return !v || isEmptyValue(v);
      case "isNotEmpty":
        return !!v && !isEmptyValue(v);
      case "eq":
        return text === String(f.value ?? "").toLowerCase();
      case "neq":
        return text !== String(f.value ?? "").toLowerCase();
      case "contains":
        return text.includes(String(f.value ?? "").toLowerCase());
      case "gt":
        return text > String(f.value ?? "");
      case "lt":
        return text < String(f.value ?? "");
    }
  });
}

export function CollectionDetail({ collectionId }: { collectionId: string }) {
  const { ws, run } = useWorkspace();
  const router = useRouter();
  const collection = ws.collections.find((c) => c.id === collectionId);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CollectionRecord | null | undefined>(undefined);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const recordsByCollection = useMemo(() => {
    const map = new Map<string, CollectionRecord[]>();
    for (const r of ws.collectionRecords) map.set(r.collectionId, [...(map.get(r.collectionId) ?? []), r]);
    return map;
  }, [ws.collectionRecords]);

  if (!collection) {
    return (
      <EmptyState
        title="컬렉션을 찾을 수 없습니다."
        action={
          <Link href="/collections" className="text-sm font-semibold text-primary underline">
            목록으로
          </Link>
        }
      />
    );
  }
  const view = collection.views.find((v) => v.id === viewId) ?? collection.views[0]!;
  const props = [...collection.properties].sort((a, b) => a.sortOrder - b.sortOrder);
  const visible = view.visiblePropertyIds.length
    ? props.filter((p) => view.visiblePropertyIds.includes(p.id))
    : props;
  const records = (recordsByCollection.get(collection.id) ?? [])
    .filter((r) => matches(view, r))
    .sort((a, b) => {
      for (const s of view.sorts) {
        const c = compareValues(a.values[s.propertyId], b.values[s.propertyId]);
        if (c !== 0) return s.direction === "asc" ? c : -c;
      }
      return a.sortOrder - b.sortOrder;
    });

  async function remove() {
    if (!collection || !window.confirm(`‘${collection.name}’ 컬렉션을 삭제할까요?`)) return;
    if (
      await run({
        type: "collection.delete",
        payload: { collectionId: collection.id, expectedVersion: collection.version },
      })
    )
      router.push("/collections");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/collections"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← 컬렉션
        </Link>
        <h1 className="mr-auto text-[22px] font-bold">{collection.name}</h1>
        <Button variant="outline" size="sm" onClick={() => setSchemaOpen(true)}>
          <Settings2 className="size-4" aria-hidden /> 속성·보기
        </Button>
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden /> 항목
        </Button>
      </div>
      <div role="tablist" aria-label="보기" className="flex gap-1">
        {collection.views.map((v) => (
          <button
            key={v.id}
            role="tab"
            type="button"
            aria-selected={v.id === view.id}
            onClick={() => setViewId(v.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold",
              v.id === view.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-card",
            )}
          >
            {v.name}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState
          title="항목이 없습니다."
          action={
            <Button size="sm" onClick={() => setEditing(null)}>
              항목 추가
            </Button>
          }
        />
      ) : view.kind === "table" ? (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-[12px] text-muted-foreground">
                {visible.map((p) => (
                  <th key={p.id} scope="col" className="px-3 py-2 font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                  onClick={() => setEditing(r)}
                >
                  {visible.map((p, i) => (
                    <td
                      key={p.id}
                      className={cn("px-3 py-2.5", p.type === "money" || p.type === "number" ? "num" : "")}
                    >
                      {i === 0 ? (
                        <button type="button" className="text-left font-medium" onClick={() => setEditing(r)}>
                          {label(p, r.values[p.id], recordsByCollection) || "—"}
                        </button>
                      ) : (
                        label(p, r.values[p.id], recordsByCollection)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : view.kind === "board" ? (
        <BoardView
          view={view}
          props={props}
          records={records}
          onOpen={setEditing}
          recordsByCollection={recordsByCollection}
        />
      ) : (
        <AgendaView view={view} props={props} records={records} onOpen={setEditing} />
      )}

      {editing !== undefined ? (
        <RecordEditor
          key={editing?.id ?? "new"}
          collection={collection}
          record={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {schemaOpen ? (
        <SchemaEditor collection={collection} onClose={() => setSchemaOpen(false)} onDelete={remove} />
      ) : null}
    </div>
  );
}

function BoardView({
  view,
  props,
  records,
  onOpen,
  recordsByCollection,
}: {
  view: CollectionView;
  props: CollectionProperty[];
  records: CollectionRecord[];
  onOpen: (r: CollectionRecord) => void;
  recordsByCollection: Map<string, CollectionRecord[]>;
}) {
  const group = props.find((p) => p.id === view.groupByPropertyId);
  if (!group) return <EmptyState title="보드를 묶을 상태/선택 속성이 없습니다." />;
  const columns = [...group.options.map((o) => ({ id: o.id, label: o.label })), { id: "", label: "없음" }];
  const titleProp = props[0];
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = records.filter((r) => {
          const v = r.values[group.id];
          const key = v && (v.type === "status" || v.type === "select") ? (v.value ?? "") : "";
          return key === col.id;
        });
        if (col.id === "" && items.length === 0) return null;
        return (
          <section
            key={col.id || "none"}
            aria-label={col.label}
            className="w-64 shrink-0 rounded-xl bg-card/70 p-2 ring-1 ring-border"
          >
            <h3 className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold text-muted-foreground">
              {col.label} <Badge>{items.length}</Badge>
            </h3>
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="block w-full rounded-xl border bg-card p-3 text-left text-sm shadow-xs hover:border-primary/40"
                  >
                    <span className="font-medium">
                      {titleProp ? label(titleProp, r.values[titleProp.id], recordsByCollection) || "—" : "—"}
                    </span>
                    {props.slice(1, 3).map((p) =>
                      p.id !== group.id && r.values[p.id] ? (
                        <span key={p.id} className="mt-0.5 block text-[12px] text-muted-foreground">
                          {p.name}: {label(p, r.values[p.id], recordsByCollection)}
                        </span>
                      ) : null,
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AgendaView({
  view,
  props,
  records,
  onOpen,
}: {
  view: CollectionView;
  props: CollectionProperty[];
  records: CollectionRecord[];
  onOpen: (r: CollectionRecord) => void;
}) {
  const dateProp = props.find((p) => p.id === view.datePropertyId);
  if (!dateProp) return <EmptyState title="달력에 쓸 날짜 속성이 없습니다." />;
  const dated = records
    .map((r) => ({
      r,
      d: r.values[dateProp.id]?.type === "date" ? (r.values[dateProp.id]!.value as string) : null,
    }))
    .filter((x) => x.d)
    .sort((a, b) => a.d!.localeCompare(b.d!));
  const months = new Map<string, typeof dated>();
  for (const x of dated) months.set(x.d!.slice(0, 7), [...(months.get(x.d!.slice(0, 7)) ?? []), x]);
  return (
    <div className="space-y-3">
      {[...months.entries()].map(([month, items]) => (
        <Card key={month}>
          <h3 className="mb-2 text-sm font-bold">
            {month.slice(0, 4)}년 {Number(month.slice(5))}월
          </h3>
          <ul className="space-y-1">
            {items.map(({ r, d }) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="num w-24 shrink-0 text-muted-foreground">{formatDateKo(d!)}</span>
                  <span className="truncate">{titleOf(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {records.length > dated.length ? (
        <p className="text-[12px] text-muted-foreground">
          날짜가 없는 항목 {records.length - dated.length}개는 표 보기에서 확인하세요.
        </p>
      ) : null}
    </div>
  );
}

function emptyValue(p: CollectionProperty): PropertyValue | undefined {
  switch (p.type) {
    case "checkbox":
      return { type: "checkbox", value: false };
    default:
      return undefined;
  }
}

function RecordEditor({
  collection,
  record,
  onClose,
}: {
  collection: Collection;
  record: CollectionRecord | null;
  onClose: () => void;
}) {
  const { ws, run } = useWorkspace();
  const props = [...collection.properties].sort((a, b) => a.sortOrder - b.sortOrder);
  const [values, setValues] = useState<Record<string, PropertyValue>>(() => {
    if (record) return record.values;
    const init: Record<string, PropertyValue> = {};
    for (const p of props) {
      const v = emptyValue(p);
      if (v) init[p.id] = v;
    }
    return init;
  });
  const set = (id: string, v: PropertyValue | undefined) =>
    setValues((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });
  const missing = props.filter((p) => p.required && (!values[p.id] || isEmptyValue(values[p.id]!)));
  const invalidMoney = Object.values(values).some((v) => v.type === "money" && !isMoney(v.value));

  async function save() {
    const ok = record
      ? await run({
          type: "collection.record.update",
          payload: { recordId: record.id, expectedVersion: record.version, values },
        })
      : await run({ type: "collection.record.create", payload: { collectionId: collection.id, values } });
    if (ok) onClose();
  }
  async function remove() {
    if (
      record &&
      (await run({
        type: "collection.record.delete",
        payload: { recordId: record.id, expectedVersion: record.version },
      }))
    )
      onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={record ? "항목 편집" : "새 항목"}
      footer={
        <>
          {record ? (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={remove}>
              <Trash2 className="size-4" aria-hidden /> 삭제
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={missing.length > 0 || invalidMoney}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {props.map((p) => {
          const v = values[p.id];
          const name = `${p.name}${p.required ? " *" : ""}`;
          switch (p.type) {
            case "text":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <TextInput
                      id={id}
                      value={v?.type === "text" ? v.value : ""}
                      maxLength={4000}
                      onChange={(e) =>
                        set(p.id, e.target.value ? { type: "text", value: e.target.value } : undefined)
                      }
                    />
                  )}
                </Field>
              );
            case "url":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <TextInput
                      id={id}
                      type="url"
                      value={v?.type === "url" ? v.value : ""}
                      onChange={(e) =>
                        set(p.id, e.target.value ? { type: "url", value: e.target.value } : undefined)
                      }
                    />
                  )}
                </Field>
              );
            case "number":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <TextInput
                      id={id}
                      type="number"
                      value={v?.type === "number" ? String(v.value) : ""}
                      onChange={(e) =>
                        set(
                          p.id,
                          e.target.value !== "" && Number.isFinite(Number(e.target.value))
                            ? { type: "number", value: Number(e.target.value) }
                            : undefined,
                        )
                      }
                    />
                  )}
                </Field>
              );
            case "money":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <MoneyInput
                      id={id}
                      value={v?.type === "money" ? v.value : ""}
                      allowNegative
                      onChange={(value) =>
                        set(p.id, value ? { type: "money", value, currency: "KRW" } : undefined)
                      }
                    />
                  )}
                </Field>
              );
            case "date":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <TextInput
                      id={id}
                      type="date"
                      value={v?.type === "date" ? v.value : ""}
                      onChange={(e) =>
                        set(p.id, e.target.value ? { type: "date", value: e.target.value } : undefined)
                      }
                    />
                  )}
                </Field>
              );
            case "checkbox":
              return (
                <Checkbox
                  key={p.id}
                  label={p.name}
                  checked={v?.type === "checkbox" ? v.value : false}
                  onChange={(c) => set(p.id, { type: "checkbox", value: c })}
                />
              );
            case "status":
            case "select":
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <Select
                      id={id}
                      value={v && (v.type === "status" || v.type === "select") ? (v.value ?? "") : ""}
                      onChange={(e) =>
                        set(
                          p.id,
                          e.target.value
                            ? p.type === "status"
                              ? { type: "status", value: e.target.value }
                              : { type: "select", value: e.target.value }
                            : undefined,
                        )
                      }
                    >
                      <option value="">없음</option>
                      {p.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              );
            case "multiSelect": {
              const selected = v?.type === "multiSelect" ? v.value : [];
              return (
                <fieldset key={p.id}>
                  <legend className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    {name}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {p.options.map((o) => {
                      const on = selected.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            set(p.id, {
                              type: "multiSelect",
                              value: on ? selected.filter((x) => x !== o.id) : [...selected, o.id],
                            })
                          }
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[13px] font-semibold",
                            on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            }
            case "relation": {
              const targets = ws.collectionRecords.filter((r) => r.collectionId === p.relationCollectionId);
              const selected = v?.type === "relation" ? v.value : [];
              return (
                <Field key={p.id} label={name}>
                  {(id) => (
                    <Select
                      id={id}
                      multiple
                      value={selected}
                      onChange={(e) =>
                        set(p.id, {
                          type: "relation",
                          value: [...e.target.selectedOptions].map((o) => o.value),
                        })
                      }
                      className="min-h-24"
                    >
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {titleOf(t)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              );
            }
          }
        })}
        {missing.length ? (
          <p className="text-[12px] text-destructive">필수: {missing.map((p) => p.name).join(", ")}</p>
        ) : null}
      </div>
    </Sheet>
  );
}

function slug(name: string, taken: Set<string>): string {
  let base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "prop";
  if (!/^[a-z0-9가-힣-]+$/.test(base)) base = "prop";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function SchemaEditor({
  collection,
  onClose,
  onDelete,
}: {
  collection: Collection;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { ws, run } = useWorkspace();
  const [name, setName] = useState(collection.name);
  const [props, setProps] = useState<CollectionProperty[]>(collection.properties);
  const [views, setViews] = useState<CollectionView[]>(collection.views);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PropertyType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newRelation, setNewRelation] = useState("");

  function addProp() {
    const taken = new Set(props.map((p) => p.id));
    const id = slug(newName, taken);
    const options = ["status", "select", "multiSelect"].includes(newType)
      ? newOptions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((label, i) => ({ id: slug(label, new Set()) + (i ? `-${i}` : ""), label, color: null }))
      : [];
    setProps([
      ...props,
      {
        id,
        name: newName.trim(),
        type: newType,
        options,
        relationCollectionId: newType === "relation" ? newRelation || null : null,
        required: false,
        sortOrder: props.length,
      },
    ]);
    setNewName("");
    setNewOptions("");
  }
  function addView(kind: CollectionView["kind"]) {
    const group = props.find((p) => p.type === "status" || p.type === "select");
    const date = props.find((p) => p.type === "date");
    const id = slug(kind, new Set(views.map((v) => v.id)));
    setViews([
      ...views,
      {
        id,
        name: kind === "table" ? "표" : kind === "board" ? "보드" : "달력",
        kind,
        groupByPropertyId: kind === "board" ? (group?.id ?? null) : null,
        datePropertyId: kind === "calendar" ? (date?.id ?? null) : null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ]);
  }
  const canBoard = props.some((p) => p.type === "status" || p.type === "select");
  const canCalendar = props.some((p) => p.type === "date");
  const invalidNew =
    !newName.trim() ||
    (["status", "select", "multiSelect"].includes(newType) && !newOptions.trim()) ||
    (newType === "relation" && !newRelation);

  async function save() {
    const removed = collection.properties.filter((p) => !props.some((q) => q.id === p.id));
    if (
      removed.length &&
      !window.confirm(
        `속성 ${removed.map((p) => p.name).join(", ")}을(를) 지우면 모든 항목의 해당 값도 지워집니다. 계속할까요?`,
      )
    )
      return;
    const ok = await run({
      type: "collection.update",
      payload: {
        collectionId: collection.id,
        expectedVersion: collection.version,
        patch: {
          name: name.trim() || collection.name,
          properties: props.map((p, i) => ({ ...p, sortOrder: i })),
          views: views.filter(
            (v) => (v.kind !== "board" || v.groupByPropertyId) && (v.kind !== "calendar" || v.datePropertyId),
          ),
        },
      },
    });
    if (ok) onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="속성과 보기"
      wide
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-destructive" onClick={onDelete}>
            컬렉션 삭제
          </Button>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save}>저장</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="컬렉션 이름">
          {(id) => (
            <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          )}
        </Field>
        <section>
          <h3 className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">속성</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {props.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <Badge>{TYPE_LABEL[p.type]}</Badge>
                {p.options.length ? (
                  <span className="hidden truncate text-[12px] text-muted-foreground sm:inline">
                    {p.options.map((o) => o.label).join(", ")}
                  </span>
                ) : null}
                <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={p.required}
                    onChange={(e) =>
                      setProps(props.map((q) => (q.id === p.id ? { ...q, required: e.target.checked } : q)))
                    }
                    className="accent-[var(--primary)]"
                  />
                  필수
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${p.name} 속성 삭제`}
                  disabled={i === 0}
                  onClick={() => setProps(props.filter((q) => q.id !== p.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-[1fr_140px]">
            <TextInput
              aria-label="새 속성 이름"
              placeholder="새 속성 이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
            />
            <Select
              aria-label="새 속성 종류"
              value={newType}
              onChange={(e) => setNewType(e.target.value as PropertyType)}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            {["status", "select", "multiSelect"].includes(newType) ? (
              <TextInput
                aria-label="선택지 (쉼표로 구분)"
                placeholder="선택지 (쉼표로 구분)"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                className="sm:col-span-2"
              />
            ) : null}
            {newType === "relation" ? (
              <Select
                aria-label="연결할 컬렉션"
                value={newRelation}
                onChange={(e) => setNewRelation(e.target.value)}
                className="sm:col-span-2"
              >
                <option value="">연결할 컬렉션</option>
                {ws.collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button
              variant="outline"
              onClick={addProp}
              disabled={invalidNew}
              className="sm:col-span-2 sm:justify-self-end"
            >
              <Plus className="size-4" aria-hidden /> 속성 추가
            </Button>
          </div>
        </section>
        <section>
          <h3 className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">보기</h3>
          <ul className="flex flex-wrap gap-2">
            {views.map((v) => (
              <li key={v.id} className="flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
                {v.name}
                <Button
                  size="icon"
                  variant="ghost"
                  className="!size-7"
                  aria-label={`${v.name} 보기 삭제`}
                  disabled={views.length === 1}
                  onClick={() => setViews(views.filter((x) => x.id !== v.id))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => addView("table")}>
              표 추가
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addView("board")}
              disabled={!canBoard}
              title={canBoard ? undefined : "상태/선택 속성이 필요합니다"}
            >
              보드 추가
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addView("calendar")}
              disabled={!canCalendar}
              title={canCalendar ? undefined : "날짜 속성이 필요합니다"}
            >
              달력 추가
            </Button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
