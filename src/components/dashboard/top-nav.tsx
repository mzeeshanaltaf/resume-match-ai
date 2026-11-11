"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CreditDisplay } from "./credit-display";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

const TITLES: [prefix: string, title: string][] = [
  ["/dashboard/match", "Job Fit"],
  ["/dashboard/screen", "Resume Screener"],
  ["/dashboard/history", "History"],
  ["/dashboard/reports", "Report"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard/help", "Help"],
];

function titleFor(pathname: string) {
  if (pathname === "/dashboard") return "Overview";
  return TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? "Dashboard";
}

export function TopNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Radix generates ids that differ between the server render and the first client render
  // on pages with Suspense boundaries; the drawer only matters once the page is interactive.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close the drawer after any navigation (also back/forward).
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 md:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-1">
        {!mounted ? (
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" disabled>
            <Menu aria-hidden />
          </Button>
        ) : (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu aria-hidden />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 max-w-[85vw] gap-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Move between the parts of ResuMatchAI.</SheetDescription>
            <Sidebar className="w-full border-r-0" onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        )}

        <p className="truncate px-1 text-sm font-semibold">{titleFor(pathname)}</p>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <CreditDisplay />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
