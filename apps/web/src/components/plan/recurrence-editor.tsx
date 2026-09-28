"use client";

import clsx from "clsx";
import type { Recurrence, Weekday } from "@liferoute/contracts";
import { WEEKDAYS, describeRecurrence } from "@liferoute/core";
import { Field, Select, TextInput } from "@/components/ui/fields";

const KO: Record<Weekday, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

/** Editor for daily / weekday / weekly / monthly (1–31 or last day) rules (FR-003). */
export function RecurrenceEditor({
  value,
  onChange,
  allowNone = true,
  defaultStart,
}: {
  value: Recurrence | null;
  onChange: (value: Recurrence | null) => void;
  allowNone?: boolean;
  defaultStart: string;
}) {
  const kind = value?.kind ?? "none";
  const base = { startDate: value?.startDate ?? defaultStart, endDate: value?.endDate ?? null };
  const setKind = (k: string) => {
    if (k === "none") onChange(null);
    else if (k === "daily" || k === "weekday") onChange({ kind: k, ...base });
    else if (k === "weekly") onChange({ kind: "weekly", weekdays: ["mon"], ...base });
    else onChange({ kind: "monthly", day: Number(base.startDate.slice(8, 10)), ...base });
  };
  return (
    <div className="space-y-3">
      <Field label="반복">
        {(id) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
            {allowNone ? <option value="none">반복 안 함</option> : null}
            <option value="daily">매일</option>
            <option value="weekday">평일(월~금)</option>
            <option value="weekly">매주 요일 선택</option>
            <option value="monthly">매월</option>
          </Select>
        )}
      </Field>
      {value?.kind === "weekly" ? (
        <fieldset>
          <legend className="label">요일</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = value.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d];
                    if (next.length > 0) onChange({ ...value, weekdays: next });
                  }}
                  className={clsx(
                    "size-9 rounded-full border text-sm font-semibold",
                    on
                      ? "border-accent bg-accent text-white"
                      : "border-line-strong text-ink-muted hover:bg-canvas",
                  )}
                >
                  {KO[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {value?.kind === "monthly" ? (
        <Field label="날짜" hint="29~31일은 그 달의 마지막 날로 맞춰집니다.">
          {(id, hint) => (
            <Select
              id={id}
              aria-describedby={hint}
              value={String(value.day)}
              onChange={(e) =>
                onChange({ ...value, day: e.target.value === "last" ? "last" : Number(e.target.value) })
              }
            >
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}일
                </option>
              ))}
              <option value="last">말일</option>
            </Select>
          )}
        </Field>
      ) : null}
      {value ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={value.startDate}
                required
                onChange={(e) => e.target.value && onChange({ ...value, startDate: e.target.value })}
              />
            )}
          </Field>
          <Field label="종료일 (선택)">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={value.endDate ?? ""}
                min={value.startDate}
                onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
              />
            )}
          </Field>
          <p className="col-span-2 text-[12px] text-ink-muted">{describeRecurrence(value)}</p>
        </div>
      ) : null}
    </div>
  );
}
