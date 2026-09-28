import {
  CalendarCheck2,
  Inbox,
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
  /** Shown in the iPhone bottom bar; the rest live under "더보기". */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "오늘", icon: Sun, mobile: true },
  { href: "/plans", label: "계획", icon: ListChecks, mobile: true },
  { href: "/assets", label: "자산", icon: Wallet, mobile: true },
  { href: "/notes", label: "노트", icon: NotebookPen, mobile: false },
  { href: "/inbox", label: "Inbox", icon: Inbox, mobile: false },
  { href: "/reviews", label: "검토", icon: CalendarCheck2, mobile: false },
  { href: "/settings", label: "설정", icon: Settings, mobile: false },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
