"use client";

import { createContext, useContext, useMemo } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export interface ToastInput {
  tone?: "success" | "danger" | "warn" | "info";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

function show(t: ToastInput) {
  const notify =
    t.tone === "success"
      ? toast.success
      : t.tone === "danger"
        ? toast.error
        : t.tone === "warn"
          ? toast.warning
          : toast.info;
  notify(t.title, {
    description: t.description,
    duration: t.action ? 10_000 : 5_000,
    action: t.action ? { label: t.action.label, onClick: t.action.onClick } : undefined,
  });
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

/** Toasts on shadcn/ui Sonner; on phones they sit above the bottom navigation. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ show }), []);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        mobileOffset={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
