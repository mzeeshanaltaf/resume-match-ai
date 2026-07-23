"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CreditDisplay } from "./credit-display";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/match": "Job Fit",
  "/dashboard/screen": "Resume Screener",
  "/dashboard/history": "History",
  "/dashboard/settings": "Settings",
};

export function TopNav() {
  const pathname = usePathname();
  const breadcrumb = breadcrumbMap[pathname] ?? "Dashboard";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4">
      {/* Mobile sidebar trigger */}
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <Sidebar />
          </SheetContent>
        </Sheet>

        {/* Breadcrumb */}
        <span className="text-sm font-medium text-muted-foreground">
          {breadcrumb}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <CreditDisplay />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
