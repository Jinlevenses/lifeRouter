"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";

/**
 * Dashboard tile: a count animated with Magic UI NumberTicker (counts only, never money:
 * amounts stay decimal strings, AGENTS.md) and an optional progress bar.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  total,
  hint,
  href,
  progress,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total?: number;
  hint?: React.ReactNode;
  href?: string;
  /** 0..100 */
  progress?: number;
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-2 px-4 py-4 shadow-xs transition-colors",
        href && "hover:border-primary/40 hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <p className="num flex items-baseline gap-1 text-[26px] leading-none font-bold tracking-tight">
        <NumberTicker value={value} className="text-foreground" />
        {total !== undefined ? (
          <span className="text-base font-semibold text-muted-foreground">/ {total}</span>
        ) : null}
      </p>
      {progress !== undefined ? (
        <Progress
          value={Math.max(0, Math.min(100, progress))}
          className="h-1.5"
          aria-label={`${label} 진행률`}
        />
      ) : null}
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
