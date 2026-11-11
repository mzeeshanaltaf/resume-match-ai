"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  History,
  LayoutDashboard,
  ScanSearch,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that count as being on this item. */
  also?: string[];
}

const TOOLS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/match", label: "Job Fit", icon: Target },
  { href: "/dashboard/screen", label: "Resume Screener", icon: ScanSearch },
  { href: "/dashboard/history", label: "History", icon: History, also: ["/dashboard/reports"] },
];

const ACCOUNT: NavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/help", label: "Help", icon: HelpCircle },
];

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  return [item.href, ...(item.also ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function NavList({
  items,
  label,
  onNavigate,
}: {
  items: NavItem[];
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul aria-label={label} className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors duration-150 md:min-h-9",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The left rail: the two tools and History on top, Settings and Help at the foot. */
export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called when a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center px-4">
        <Wordmark href="/dashboard" />
      </div>

      <nav aria-label="Dashboard" className="flex flex-1 flex-col justify-between overflow-y-auto px-3 pb-4 pt-2">
        <NavList items={TOOLS} label="Tools" onNavigate={onNavigate} />
        <NavList items={ACCOUNT} label="Account" onNavigate={onNavigate} />
      </nav>
    </aside>
  );
}
