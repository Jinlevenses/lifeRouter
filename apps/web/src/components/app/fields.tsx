"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { formatAmount, isMoney, parseMoneyInput } from "@liferoute/core";
import { cn } from "@/lib/utils";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import {
  Field as UiField,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/** Labelled control on the shadcn/ui Field; the child receives the control id and hint id. */
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
    <UiField className={cn("gap-1.5", className)} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </FieldLabel>
      {children(id, hintId)}
      {error ? (
        <FieldError id={hintId} className="text-[13px]">
          {error}
        </FieldError>
      ) : hint ? (
        <FieldDescription id={hintId} className="text-xs">
          {hint}
        </FieldDescription>
      ) : null}
    </UiField>
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <Input className={cn("bg-card", className)} {...props} />;
}

/** Search box (shadcn/ui InputGroup with a leading icon); className sizes the group. */
export function SearchInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <InputGroup className={cn("bg-card", className)}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput type="search" {...props} />
    </InputGroup>
  );
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <Textarea className={cn("min-h-20 resize-y bg-card", className)} {...props} />;
}

/** Native select (shadcn/ui NativeSelect); className sizes the wrapper, the select fills it. */
export function Select({ className, ...props }: Omit<React.ComponentProps<"select">, "size">) {
  return (
    <NativeSelect
      wrapperClassName={cn("w-full", className)}
      className="w-full bg-card text-base md:text-sm"
      {...props}
    />
  );
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
  className,
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
    <InputGroup className="bg-card">
      <InputGroupInput
        {...rest}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={cn("num", className)}
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
      <InputGroupAddon align="inline-end">
        <InputGroupText>{suffix}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
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
    <UiField orientation="horizontal" className="items-start gap-2.5">
      <UiCheckbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <FieldContent className="gap-0.5">
        <FieldLabel htmlFor={id} className="text-sm font-medium">
          {label}
        </FieldLabel>
        {description ? <FieldDescription className="text-xs">{description}</FieldDescription> : null}
      </FieldContent>
    </UiField>
  );
}
