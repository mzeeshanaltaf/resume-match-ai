"use client";

import { useDashboardData } from "@/contexts/dashboard-data";
import { HistoryTable } from "@/components/dashboard/history/history-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HistoryPage() {
  const { matches, resumes, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <Skeleton className="h-9 w-72 rounded-md" />
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex gap-4">
            {["w-32", "w-48", "w-20", "w-24", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border-b border-border last:border-0 px-4 py-4 flex gap-4 items-center">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your past resume match analyses.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          <Link href="/dashboard/match">
            New analysis <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <HistoryTable initialMatches={matches ?? []} resumes={resumes ?? []} />
    </div>
  );
}
