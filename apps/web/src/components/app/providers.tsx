"use client";

import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";

/** App-wide providers: Magic UI motion follows the OS "reduce motion" setting; shadcn tooltips. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>{children}</TooltipProvider>
    </MotionConfig>
  );
}
