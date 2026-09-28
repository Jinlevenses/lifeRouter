"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CommandResultMap, WorkspaceData } from "@liferoute/contracts";
import { ApiRequestError, fetchWorkspace, postCommand, type CommandRequestBody } from "./api-client";
import { useToast } from "@/components/ui/toast";

interface WorkspaceContextValue {
  ws: WorkspaceData;
  refresh: () => Promise<void>;
  /** Runs a command, refreshes the read model and reports errors as toasts. Returns null on failure. */
  run: <C extends CommandRequestBody>(
    command: C,
    options?: { success?: string; quiet?: boolean; onError?: (e: ApiRequestError) => boolean | void },
  ) => Promise<CommandResultMap[C["type"]] | null>;
  busy: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceData;
  children: React.ReactNode;
}) {
  const [ws, setWs] = useState(initial);
  const [pending, setPending] = useState(0);
  const toast = useToast();
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    inflight.current = fetchWorkspace()
      .then(setWs)
      .catch((e) => {
        if (!(e instanceof ApiRequestError && e.status === 401))
          toast.show({ tone: "danger", title: "최신 데이터를 불러오지 못했습니다." });
      })
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [toast]);

  // Stay fresh when returning to the tab (sync delay must not stay hidden, docs/01_product).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const run = useCallback<WorkspaceContextValue["run"]>(
    async (command, options) => {
      setPending((n) => n + 1);
      try {
        const result = await postCommand(command);
        await refresh();
        if (options?.success) toast.show({ tone: "success", title: options.success });
        return result;
      } catch (error) {
        if (error instanceof ApiRequestError) {
          if (options?.onError?.(error)) return null;
          if (!options?.quiet) {
            toast.show({
              tone: error.code === "VERSION_CONFLICT" ? "warn" : "danger",
              title: error.message,
              description: error.nextAction,
              action:
                error.code === "VERSION_CONFLICT"
                  ? { label: "최신 불러오기", onClick: () => void refresh() }
                  : undefined,
            });
          }
          if (error.code === "VERSION_CONFLICT") void refresh();
        } else {
          toast.show({
            tone: "danger",
            title: "네트워크 오류로 저장하지 못했습니다.",
            description: "연결을 확인하고 다시 시도하세요.",
          });
        }
        return null;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [refresh, toast],
  );

  const value = useMemo(() => ({ ws, refresh, run, busy: pending > 0 }), [ws, refresh, run, pending]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
