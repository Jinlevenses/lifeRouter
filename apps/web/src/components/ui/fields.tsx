"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { formatAmount, isMoney, parseMoneyInput } from "@liferoute/core";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-[12px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("field", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx("field min-h-20 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("field appearance-auto pr-8", props.className)} />;
}

/**
 * Amount input that never converts to a JS number (docs/05_web): the value is kept as the
 * canonical decimal string; display adds thousands separators while not focused.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  allowNegative = false,
  maxFractionDigits = 4,
  suffix = "원",
  ...rest
}: {
  id?: string;
  value: string;
  onChange: (value: string, valid: boolean) => void;
  allowNegative?: boolean;
  maxFractionDigits?: number;
  suffix?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value);
  const shown = focused ? raw : value && isMoney(value) ? formatAmount(value) : raw;
  return (
    <div className="relative">
      <input
        {...rest}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={clsx("field num pr-10", rest.className)}
        value={shown}
        onFocus={() => {
          setFocused(true);
          setRaw(value);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setRaw(e.target.value);
          const parsed = parseMoneyInput(e.target.value, maxFractionDigits);
          const valid = parsed !== null && (allowNegative || !parsed.startsWith("-"));
          onChange(valid ? parsed : e.target.value, valid);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-subtle">
        {suffix}
      </span>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 accent-[var(--color-accent)]"
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-[12px] text-ink-muted">{description}</span> : null}
      </label>
    </div>
  );
}
