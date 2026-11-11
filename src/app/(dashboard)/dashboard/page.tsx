"use client";

import { useSession } from "@/lib/auth-client";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  FileSearch,
  FileText,
  Briefcase,
  ArrowRight,
  BarChart3,
} from "lucide-react";

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user.name?.trim().split(/\s+/)[0];
  const { overview, credits, loading, error } = useDashboardData();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const counts = overview?.counts;
  const recentMatches = overview?.recent_matches ?? [];
  const matchCost = credits?.costs.match ?? 1;

  const stats = [
    {
      label: "Resumes",
      value: String(counts?.resumes ?? 0),
      icon: FileText,
    },
    {
      label: "Job Descriptions",
      value: String(counts?.job_descriptions ?? 0),
      icon: Briefcase,
    },
    {
      label: "Analyses",
      value: String(counts?.matches ?? 0),
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s an overview of your resume match activity.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent matches or empty state */}
      {recentMatches.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Analyses</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/history">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {recentMatches.map((match) => (
                <li
                  key={match.id}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {match.resume_file_name ?? "Unknown"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {match.company_name && match.job_title
                          ? `${match.company_name} — ${match.job_title}`
                          : match.company_name || match.job_title || match.jd_url || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${scoreColor(match.overall_score_percent ?? 0)}`}
                    >
                      {match.overall_score_percent ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.created_at ? formatDate(match.created_at) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FileSearch className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">
              Run your first resume analysis
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Upload your resume and paste a job description to get an instant
              AI match score and personalised recommendations.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400">
                <Link href="/dashboard/match">
                  Start matching <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <Badge variant="secondary" className="mt-4">
              {matchCost} credit per analysis · uploads are free
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
