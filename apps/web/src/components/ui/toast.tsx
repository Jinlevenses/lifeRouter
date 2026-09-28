"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Toast as RadixToast } from "radix-ui";
import { X } from "lucide-react";
import clsx from "clsx";

export interface ToastInput {
  tone?: "success" | "danger" | "warn" | "info";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<(ToastInput & { id: number })[]>([]);
  const show = useCallback((t: ToastInput) => {
    setToasts((prev) => [...prev.slice(-3), { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="down" duration={5000}>
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            type={t.tone === "danger" || t.tone === "warn" ? "foreground" : "background"}
            duration={t.action ? 10000 : 5000}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }}
            className={clsx(
              "card flex items-start gap-3 border-l-4 p-3.5 pr-2 shadow-[var(--shadow-pop)]",
              t.tone === "success" && "border-l-accent",
              t.tone === "danger" && "border-l-danger",
              t.tone === "warn" && "border-l-warn",
              (!t.tone || t.tone === "info") && "border-l-info",
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-sm font-semibold">{t.title}</RadixToast.Title>
              {t.description ? (
                <RadixToast.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {t.description}
                </RadixToast.Description>
              ) : null}
              {t.action ? (
                <RadixToast.Action altText={t.action.label} asChild>
                  <button
                    type="button"
                    onClick={t.action.onClick}
                    className="mt-2 rounded-lg bg-canvas px-2.5 py-1 text-[13px] font-semibold text-accent-strong hover:bg-accent-soft"
                  >
                    {t.action.label}
                  </button>
                </RadixToast.Action>
              ) : null}
            </div>
            <RadixToast.Close
              aria-label="닫기"
              className="rounded-md p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-sm flex-col gap-2 outline-none lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
