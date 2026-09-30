"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { CollectionProperty, CollectionView } from "@liferoute/contracts";
import { EmptyState, PageHeader } from "@/components/app/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/app/dialog";
import { Field, Select, TextInput } from "@/components/app/fields";
import { useWorkspace } from "@/lib/workspace";

const TEMPLATES: Record<
  string,
  { label: string; properties: CollectionProperty[]; views: CollectionView[] }
> = {
  blank: {
    label: "빈 컬렉션",
    properties: [
      {
        id: "title",
        name: "이름",
        type: "text",
        options: [],
        relationCollectionId: null,
        required: true,
        sortOrder: 0,
      },
    ],
    views: [
      {
        id: "table",
        name: "표",
        kind: "table",
        groupByPropertyId: null,
        datePropertyId: null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ],
  },
  reading: {
    label: "독서 목록",
    properties: [
      {
        id: "title",
        name: "제목",
        type: "text",
        options: [],
        relationCollectionId: null,
        required: true,
        sortOrder: 0,
      },
      {
        id: "status",
        name: "상태",
        type: "status",
        options: [
          { id: "want", label: "읽고 싶음", color: null },
          { id: "reading", label: "읽는 중", color: null },
          { id: "done", label: "다 읽음", color: null },
        ],
        relationCollectionId: null,
        required: false,
        sortOrder: 1,
      },
      {
        id: "finished",
        name: "다 읽은 날",
        type: "date",
        options: [],
        relationCollectionId: null,
        required: false,
        sortOrder: 2,
      },
      {
        id: "link",
        name: "링크",
        type: "url",
        options: [],
        relationCollectionId: null,
        required: false,
        sortOrder: 3,
      },
    ],
    views: [
      {
        id: "table",
        name: "표",
        kind: "table",
        groupByPropertyId: null,
        datePropertyId: null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
      {
        id: "board",
        name: "보드",
        kind: "board",
        groupByPropertyId: "status",
        datePropertyId: null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ],
  },
  wishlist: {
    label: "구매 목록",
    properties: [
      {
        id: "title",
        name: "물건",
        type: "text",
        options: [],
        relationCollectionId: null,
        required: true,
        sortOrder: 0,
      },
      {
        id: "price",
        name: "가격",
        type: "money",
        options: [],
        relationCollectionId: null,
        required: false,
        sortOrder: 1,
      },
      {
        id: "bought",
        name: "구매함",
        type: "checkbox",
        options: [],
        relationCollectionId: null,
        required: false,
        sortOrder: 2,
      },
      {
        id: "when",
        name: "사고 싶은 날",
        type: "date",
        options: [],
        relationCollectionId: null,
        required: false,
        sortOrder: 3,
      },
    ],
    views: [
      {
        id: "table",
        name: "표",
        kind: "table",
        groupByPropertyId: null,
        datePropertyId: null,
        sorts: [{ propertyId: "price", direction: "desc" }],
        filters: [],
        visiblePropertyIds: [],
      },
      {
        id: "calendar",
        name: "달력",
        kind: "calendar",
        groupByPropertyId: null,
        datePropertyId: "when",
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ],
  },
};

/** 컬렉션 (FR-006): typed properties with table / board / calendar views. No formulas or rollups. */
export default function CollectionsPage() {
  const { ws, run } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("reading");

  async function create() {
    const t = TEMPLATES[template]!;
    const result = await run({
      type: "collection.create",
      payload: { name: name.trim() || t.label, properties: t.properties, views: t.views },
    });
    if (result) router.push(`/collections/${result.collection.id}`);
  }

  return (
    <>
      <PageHeader
        title="컬렉션"
        description="직접 정한 속성으로 목록을 관리합니다 (표·보드·달력)."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> 새 컬렉션
          </Button>
        }
      />
      {ws.collections.length === 0 ? (
        <EmptyState
          title="컬렉션이 없습니다."
          description="독서 목록, 구매 목록처럼 반복되는 기록을 표로 모아 보세요."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ws.collections.map((c) => (
            <li key={c.id}>
              <Link
                href={`/collections/${c.id}`}
                className="block rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <p className="text-[15px] font-bold">
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {ws.collectionRecords.filter((r) => r.collectionId === c.id).length}개 · 속성{" "}
                  {c.properties.length}개
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="새 컬렉션"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button onClick={create}>만들기</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="템플릿">
            {(id) => (
              <Select id={id} value={template} onChange={(e) => setTemplate(e.target.value)}>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="이름">
            {(id) => (
              <TextInput
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={TEMPLATES[template]!.label}
                maxLength={100}
              />
            )}
          </Field>
        </div>
      </Sheet>
    </>
  );
}
