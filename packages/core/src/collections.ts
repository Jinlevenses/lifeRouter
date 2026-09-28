import type { CollectionProperty, CollectionView, PropertyValue } from "@liferoute/contracts";
import { cmp } from "./money";
import type { DocIssue } from "./notes";

/**
 * User collections (FR-006, review D-31/D-32): typed values keyed by property id, validated against
 * the collection's properties. No formulas, rollups or real-time collaboration.
 */
export function validateRecordValues(
  properties: readonly CollectionProperty[],
  values: Record<string, PropertyValue>,
  relationExists: (collectionId: string, recordId: string) => boolean = () => true,
): DocIssue[] {
  const issues: DocIssue[] = [];
  const byId = new Map(properties.map((p) => [p.id, p]));
  for (const [key, value] of Object.entries(values)) {
    const prop = byId.get(key);
    const path = `values.${key}`;
    if (!prop) {
      issues.push({ path, message: "알 수 없는 속성입니다" });
      continue;
    }
    if (prop.type !== value.type) {
      issues.push({ path, message: `속성 타입(${prop.type})과 값 타입(${value.type})이 다릅니다` });
      continue;
    }
    const optionIds = new Set(prop.options.map((o) => o.id));
    if (value.type === "status" && !optionIds.has(value.value))
      issues.push({ path, message: "없는 상태 값입니다" });
    if (value.type === "select" && value.value !== null && !optionIds.has(value.value)) {
      issues.push({ path, message: "없는 선택지입니다" });
    }
    if (value.type === "multiSelect" && value.value.some((v) => !optionIds.has(v))) {
      issues.push({ path, message: "없는 선택지가 포함되어 있습니다" });
    }
    if (value.type === "url" && !/^https?:\/\//i.test(value.value)) {
      issues.push({ path, message: "http(s) 주소만 허용됩니다" });
    }
    if (value.type === "relation" && prop.relationCollectionId) {
      const target = prop.relationCollectionId;
      if (value.value.some((id) => !relationExists(target, id)))
        issues.push({ path, message: "연결 대상이 없습니다" });
    }
  }
  for (const prop of properties) {
    if (!prop.required) continue;
    const v = values[prop.id];
    if (!v || isEmptyValue(v))
      issues.push({ path: `values.${prop.id}`, message: `${prop.name}은(는) 필수입니다` });
  }
  return issues;
}

export function isEmptyValue(value: PropertyValue): boolean {
  switch (value.type) {
    case "text":
    case "url":
      return value.value.trim() === "";
    case "select":
      return value.value === null;
    case "multiSelect":
    case "relation":
      return value.value.length === 0;
    default:
      return false;
  }
}

/** Drops values for properties that no longer exist (after a property is removed). */
export function pruneValues(
  properties: readonly CollectionProperty[],
  values: Record<string, PropertyValue>,
): Record<string, PropertyValue> {
  const ids = new Set(properties.map((p) => p.id));
  return Object.fromEntries(
    Object.entries(values).filter(
      ([k, v]) => ids.has(k) && properties.find((p) => p.id === k)?.type === v.type,
    ),
  );
}

export function validateViews(
  properties: readonly CollectionProperty[],
  views: readonly CollectionView[],
): DocIssue[] {
  const issues: DocIssue[] = [];
  const byId = new Map(properties.map((p) => [p.id, p]));
  const ids = new Set<string>();
  for (const [i, view] of views.entries()) {
    const path = `views[${i}]`;
    if (ids.has(view.id)) issues.push({ path, message: "view id가 중복됩니다" });
    ids.add(view.id);
    if (view.kind === "board") {
      const p = view.groupByPropertyId ? byId.get(view.groupByPropertyId) : undefined;
      if (!p || (p.type !== "status" && p.type !== "select")) {
        issues.push({ path, message: "보드는 상태/선택 속성으로 묶어야 합니다" });
      }
    }
    if (view.kind === "calendar") {
      const p = view.datePropertyId ? byId.get(view.datePropertyId) : undefined;
      if (!p || p.type !== "date") issues.push({ path, message: "캘린더는 날짜 속성이 필요합니다" });
    }
    for (const s of view.sorts)
      if (!byId.has(s.propertyId)) issues.push({ path, message: "정렬 속성이 없습니다" });
    for (const f of view.filters)
      if (!byId.has(f.propertyId)) issues.push({ path, message: "필터 속성이 없습니다" });
  }
  const propIds = new Set<string>();
  for (const p of properties) {
    if (propIds.has(p.id)) issues.push({ path: `properties.${p.id}`, message: "속성 id가 중복됩니다" });
    propIds.add(p.id);
  }
  return issues;
}

/** Total order for sorting records by a property; empty values sort last. */
export function compareValues(a: PropertyValue | undefined, b: PropertyValue | undefined): number {
  const aEmpty = !a || isEmptyValue(a);
  const bEmpty = !b || isEmptyValue(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (a.type === "money" && b.type === "money") return cmp(a.value, b.value);
  if (a.type === "number" && b.type === "number") return a.value - b.value;
  if (a.type === "checkbox" && b.type === "checkbox") return Number(a.value) - Number(b.value);
  return displayString(a).localeCompare(displayString(b), "ko");
}

export function displayString(value: PropertyValue): string {
  switch (value.type) {
    case "multiSelect":
    case "relation":
      return value.value.join(", ");
    case "checkbox":
      return value.value ? "✓" : "";
    case "select":
      return value.value ?? "";
    case "number":
      return String(value.value);
    default:
      return value.value;
  }
}
