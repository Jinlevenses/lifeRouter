"use client";

import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";

/** Goal progress ring (Magic UI) with an accessible progressbar role; the percent is shown beside it. */
export function GoalRing({ percent, className }: { percent: number; className?: string }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="목표 달성률"
      className={cn("relative size-20 shrink-0", className)}
    >
      <AnimatedCircularProgressBar
        value={value}
        gaugePrimaryColor="var(--primary)"
        gaugeSecondaryColor="color-mix(in oklab, var(--primary) 12%, transparent)"
        className="size-full text-[0px] [&_[data-current-value]]:hidden"
      />
      <Target className="absolute inset-0 m-auto size-6 text-primary" aria-hidden />
    </div>
  );
}
