"use client";

import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Single-choice segmented control on the shadcn/ui ToggleGroup (items are radios). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  itemClassName,
  size = "sm",
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  label: string;
  className?: string;
  itemClassName?: string;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as T);
      }}
      aria-label={label}
      className={cn("bg-card", className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            "gap-1.5 px-3 font-semibold text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
            itemClassName,
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
