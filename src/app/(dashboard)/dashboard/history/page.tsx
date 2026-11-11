"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";
import { ErrorNote } from "@/components/dashboard/notes";
import { PageHeader } from "@/components/dashboard/page-header";
import { HistoryTable } from "@/components/dashboard/history/history-table";

function HistoryContent() {
  const { matches, resumes, jds, loading, error, refreshAll } = useDashboardData();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "screener" ? "screener" : "job_fit";

  if (loading) return <HistorySkeleton />;

  if (!matches) {
    return (
      <ErrorNote
        title="Your history did not load"
        actions={
          <Button size="sm" variant="outline" onClick={() => refreshAll()}>
            Try again
          </Button>
        }
      >
        {error ?? "Something went wrong while loading your analyses."}
      </ErrorNote>
    );
  }

  return (
    <>
      {error && <ErrorNote title="Some of this may be out of date">{error}</ErrorNote>}
      <HistoryTable
        matches={matches}
        resumes={resumes ?? []}
        jds={jds ?? []}
        defaultTab={defaultTab}
      />
    </>
  );
}

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="History"
        description="Every analysis you have run. Open one to read the full report."
        actions={
          <Button asChild>
            <Link href="/dashboard/match">New analysis</Link>
          </Button>
        }
      />
      {/* useSearchParams needs a boundary; keeping it here keeps the shell out of it. */}
      <Suspense fallback={<HistorySkeleton />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your history" className="space-y-4">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="space-y-px">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border py-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-52" />
            <Skeleton className="ml-auto h-8 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
