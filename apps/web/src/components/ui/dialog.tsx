"use client";

import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Radix dialog styled as a bottom sheet on phones and a centered panel on desktop.
 * Radix provides the focus trap, Escape handling and aria wiring (docs/05_web).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <RadixDialog.Content
          className={clsx(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface shadow-[var(--shadow-pop)] focus:outline-none",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <RadixDialog.Title className="text-base font-bold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close aria-label="닫기" className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas">
              <X className="size-5" aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
