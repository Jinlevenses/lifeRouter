"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, MoreHorizontal, Plus, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "@/lib/workspace";
import { NAV_GROUPS, NAV_ITEMS, isActive } from "./nav-items";
import { QuickCapture } from "./quick-capture";

/** 232px desktop sidebar (docs/01_product) and a capture-first bottom bar on iPhone. */
export function AppShell({ ownerName, children }: { ownerName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { ws } = useWorkspace();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inboxNew = ws.inbox.filter((i) => i.status === "new").length;

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/login");
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "232px" } as React.CSSProperties}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-lg"
      >
        본문으로 건너뛰기
      </a>

      <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-r md:flex">
        <SidebarHeader className="gap-3 px-3 pt-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2 py-1">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-500 text-primary-foreground shadow-sm">
              <Route className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] leading-tight font-bold tracking-tight">LifeRoute</span>
              <span className="block truncate text-xs text-muted-foreground">{ownerName}</span>
            </span>
          </Link>
          <Button onClick={() => setCaptureOpen(true)} className="w-full shadow-sm">
            <Plus aria-hidden /> 빠른 캡처
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="주 메뉴">
            {NAV_GROUPS.filter((g) => g.id !== "system").map((group) => (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV_ITEMS.filter((i) => i.group === group.id).map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={active} className="h-9 text-[14px]">
                            <Link href={item.href} aria-current={active ? "page" : undefined}>
                              <item.icon aria-hidden />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                          {item.href === "/inbox" && inboxNew > 0 ? (
                            <SidebarMenuBadge className="bg-primary/10 text-primary">
                              {inboxNew}
                            </SidebarMenuBadge>
                          ) : null}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t">
          <SidebarMenu>
            {NAV_ITEMS.filter((i) => i.group === "system").map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} className="h-9">
                  <Link href={item.href}>
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="h-9 text-muted-foreground">
                <LogOut aria-hidden />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset id="main" className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-teal-500 text-primary-foreground">
              <Route className="size-3.5" aria-hidden />
            </span>
            LifeRoute
          </Link>
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {ownerName.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </header>
        <div className="px-4 pt-5 pb-28 sm:px-6 md:px-8 md:pt-8 md:pb-12 lg:px-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </SidebarInset>

      {/* iPhone bottom bar with capture-first action */}
      <nav
        aria-label="주 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform hover:bg-primary/90 active:scale-95"
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
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                NAV_ITEMS.some((i) => !i.mobile && isActive(pathname, i.href))
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              더보기
              {inboxNew > 0 ? (
                <span
                  className="absolute top-1.5 right-[calc(50%-18px)] size-2 rounded-full bg-primary"
                  aria-hidden
                />
              ) : null}
            </button>
          </li>
        </ul>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <DrawerHeader className="text-left">
            <DrawerTitle>더보기</DrawerTitle>
            <DrawerDescription className="sr-only">추가 메뉴</DrawerDescription>
          </DrawerHeader>
          <ul className="space-y-1 px-3">
            {NAV_ITEMS.filter((i) => !i.mobile).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
                >
                  <item.icon className="size-5 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/inbox" && inboxNew > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {inboxNew}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[15px] text-muted-foreground hover:bg-muted"
              >
                <LogOut className="size-5" aria-hidden /> 로그아웃
              </button>
            </li>
          </ul>
        </DrawerContent>
      </Drawer>

      <QuickCapture open={captureOpen} onOpenChange={setCaptureOpen} />
    </SidebarProvider>
  );
}

function MobileLink({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <item.icon className="size-5" aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}
