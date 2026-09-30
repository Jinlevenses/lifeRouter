import {
  CalendarCheck2,
  Inbox,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Settings,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sidebar group on desktop. */
  group: "daily" | "records" | "system";
  /** Shown in the iPhone bottom bar; the rest live under "더보기". */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "오늘", icon: Sun, group: "daily", mobile: true },
  { href: "/plans", label: "계획", icon: ListChecks, group: "daily", mobile: true },
  { href: "/inbox", label: "Inbox", icon: Inbox, group: "daily", mobile: false },
  { href: "/assets", label: "자산", icon: Wallet, group: "records", mobile: true },
  { href: "/notes", label: "노트", icon: NotebookPen, group: "records", mobile: false },
  { href: "/collections", label: "컬렉션", icon: LayoutGrid, group: "records", mobile: false },
  { href: "/reviews", label: "검토", icon: CalendarCheck2, group: "records", mobile: false },
  { href: "/settings", label: "설정", icon: Settings, group: "system", mobile: false },
];

export const NAV_GROUPS = [
  { id: "daily", label: "매일" },
  { id: "records", label: "기록" },
  { id: "system", label: "시스템" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
