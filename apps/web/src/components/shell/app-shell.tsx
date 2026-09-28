"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { LogOut, MoreHorizontal, Plus, X } from "lucide-react";
import clsx from "clsx";
import { NAV_ITEMS, isActive } from "./nav-items";
import { QuickCapture } from "./quick-capture";
import { authClient } from "@/lib/auth-client";

export function AppShell({ ownerName, children }: { ownerName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/login");
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-[var(--shadow-pop)]"
      >
        본문으로 건너뛰기
      </a>

      {/* Desktop sidebar: 232px (docs/01_product) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Link href="/" className="text-[17px] font-bold tracking-tight">
            Life<span className="text-accent">Route</span>
          </Link>
          <p className="mt-0.5 truncate text-xs text-ink-subtle">{ownerName}</p>
        </div>
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="mx-4 mb-3 flex items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          <Plus className="size-4" aria-hidden /> 빠른 캡처
        </button>
        <nav aria-label="주 메뉴" className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] font-medium",
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-ink-muted hover:bg-canvas hover:text-ink",
                )}
              >
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-sm text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> 로그아웃
          </button>
        </div>
      </aside>

      <main
        id="main"
        className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:ml-sidebar lg:max-w-none lg:px-10 lg:pb-12 lg:pt-8"
      >
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* iPhone bottom bar with capture-first action */}
      <nav
        aria-label="주 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV_ITEMS.filter((i) => i.mobile)
            .slice(0, 2)
            .map((item) => (
              <MobileLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          <li className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setCaptureOpen(true)}
              aria-label="빠른 캡처"
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-[var(--shadow-pop)] hover:bg-accent-strong"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          </li>
          {NAV_ITEMS.filter((i) => i.mobile)
            .slice(2)
            .map((item) => (
              <MobileLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={clsx(
                "flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                NAV_ITEMS.some((i) => !i.mobile && isActive(pathname, i.href))
                  ? "text-accent"
                  : "text-ink-muted",
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              더보기
            </button>
          </li>
        </ul>
      </nav>

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)]">
            <div className="mb-2 flex items-center justify-between">
              <Dialog.Title className="text-base font-bold">더보기</Dialog.Title>
              <Dialog.Close aria-label="닫기" className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas">
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">추가 메뉴</Dialog.Description>
            <ul className="space-y-1">
              {NAV_ITEMS.filter((i) => !i.mobile).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="flex items-center gap-3 rounded-[10px] px-3 py-3 text-[15px] font-medium hover:bg-canvas"
                  >
                    <item.icon className="size-5 text-ink-muted" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-[15px] text-ink-muted hover:bg-canvas"
                >
                  <LogOut className="size-5" aria-hidden /> 로그아웃
                </button>
              </li>
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <QuickCapture open={captureOpen} onOpenChange={setCaptureOpen} />
    </div>
  );
}

function MobileLink({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
          active ? "text-accent" : "text-ink-muted",
        )}
      >
        <item.icon className="size-5" aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}
