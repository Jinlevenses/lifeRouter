import { describe, expect, it } from "vitest";
import type { CollectionProperty, CollectionView } from "@liferoute/contracts";
import { compareValues, pruneValues, validateRecordValues, validateViews } from "../src/collections";

const props: CollectionProperty[] = [
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
    id: "state",
    name: "상태",
    type: "status",
    options: [
      { id: "todo", label: "할 일", color: null },
      { id: "done", label: "완료", color: null },
    ],
    relationCollectionId: null,
    required: false,
    sortOrder: 1,
  },
  {
    id: "price",
    name: "가격",
    type: "money",
    options: [],
    relationCollectionId: null,
    required: false,
    sortOrder: 2,
  },
  {
    id: "day",
    name: "날짜",
    type: "date",
    options: [],
    relationCollectionId: null,
    required: false,
    sortOrder: 3,
  },
];

describe("UNIT-COLLECTION-001 typed collection values (FR-006)", () => {
  it("accepts matching values", () => {
    expect(
      validateRecordValues(props, {
        title: { type: "text", value: "책" },
        state: { type: "status", value: "todo" },
        price: { type: "money", value: "15000", currency: "KRW" },
      }),
    ).toEqual([]);
  });

  it("rejects unknown keys, type mismatches, unknown options and missing required values", () => {
    const issues = validateRecordValues(props, {
      nope: { type: "text", value: "x" },
      state: { type: "status", value: "archived" },
      price: { type: "number", value: 3 },
    });
    expect(issues.map((i) => i.path)).toEqual([
      "values.nope",
      "values.state",
      "values.price",
      "values.title",
    ]);
  });

  it("prunes values of removed properties", () => {
    expect(
      pruneValues(props.slice(0, 1), {
        title: { type: "text", value: "a" },
        state: { type: "status", value: "todo" },
      }),
    ).toEqual({
      title: { type: "text", value: "a" },
    });
  });

  it("requires a status/select property for boards and a date property for calendars", () => {
    const views: CollectionView[] = [
      {
        id: "b",
        name: "보드",
        kind: "board",
        groupByPropertyId: "price",
        datePropertyId: null,
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
      {
        id: "c",
        name: "달력",
        kind: "calendar",
        groupByPropertyId: null,
        datePropertyId: "day",
        sorts: [],
        filters: [],
        visiblePropertyIds: [],
      },
    ];
    expect(validateViews(props, views).map((i) => i.path)).toEqual(["views[0]"]);
  });

  it("orders money exactly and puts empty values last", () => {
    const a = { type: "money" as const, value: "9.5", currency: "KRW" };
    const b = { type: "money" as const, value: "10", currency: "KRW" };
    expect(compareValues(a, b)).toBe(-1);
    expect(compareValues(undefined, a)).toBe(1);
  });
});
