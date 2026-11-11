import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { DashboardDataProvider } from "@/contexts/dashboard-data";
import { reenieBeanie } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/**
 * The app shell. The editor's handwriting is loaded here (the report's margin
 * notes and written score use it). When printing, the shell steps aside so a
 * report prints as the document alone, across as many pages as it needs.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardDataProvider>
      <div
        className={cn(
          reenieBeanie.variable,
          "flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible",
        )}
      >
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <div className="hidden md:flex print:hidden">
          <Sidebar className="w-60" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
          <TopNav />
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 overflow-y-auto px-4 py-6 outline-none md:px-8 md:py-8 print:overflow-visible print:p-0"
          >
            {children}
          </main>
        </div>
      </div>
    </DashboardDataProvider>
  );
}
