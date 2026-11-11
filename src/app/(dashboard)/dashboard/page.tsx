"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ScanSearch, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";
import type { CreditTransaction, MatchListItem } from "@/lib/api/types";
import { formatDate, plural, signed } from "@/lib/format";
import { SCORE_TEXT, scoreBand } from "@/lib/score";
import { cn } from "@/lib/utils";
import { ErrorNote } from "@/components/dashboard/notes";
import { PageHeader } from "@/components/dashboard/page-header";
import { ScrollRegion } from "@/components/dashboard/scroll-region";

/** Net credits an analysis cost, read from the ledger (a refund cancels the charge). */
function creditsFor(matchId: string, ledger: CreditTransaction[] | null): number | null {
  if (!ledger) return null;
  const rows = ledger.filter((t) => t.reference_id === matchId);
  return rows.length ? rows.reduce((sum, t) => sum + t.credits_delta, 0) : null;
}

function postingLine(m: MatchListItem) {
  const parts = [m.job_title, m.company_name].filter(Boolean);
  return parts.length ? parts.join(", ") : (m.jd_url ?? "Job posting");
}

export default function OverviewPage() {
  const { overview, creditBalance, creditHistory, loading, error, refreshAll } =
    useDashboardData();

  const recent = overview?.recent_matches ?? [];
  const counts = overview?.counts;
  const outOfCredits = creditBalance === 0;

  const summary = useMemo(() => {
    if (!counts) return undefined;
    return `${plural(counts.resumes, "resume")}, ${plural(counts.job_descriptions, "job posting")} and ${plural(counts.matches, "analysis", "analyses")} so far.`;
  }, [counts]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Overview"
        description={summary}
        actions={
          <>
            <Button asChild>
              <Link href="/dashboard/match">
                <Target /> Check a resume
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/screen">
                <ScanSearch /> Screen resumes
              </Link>
            </Button>
          </>
        }
      />

      {outOfCredits && (
        <ErrorNote
          title="You are out of credits"
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/settings?tab=credits">See your credits</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/contact">Ask about more</Link>
              </Button>
            </>
          }
        >
          New analyses need credits. Uploading resumes, adding postings and reading your
          reports still work.
        </ErrorNote>
      )}

      {error && !overview && (
        <ErrorNote
          title="Your overview did not load"
          actions={
            <Button size="sm" variant="outline" onClick={() => refreshAll()}>
              Try again
            </Button>
          }
        >
          {error}
        </ErrorNote>
      )}

      {loading && <LedgerSkeleton />}

      {!loading && overview && recent.length === 0 && <FirstRun />}

      {!loading && recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="flex items-end justify-between gap-4">
            <h2 id="recent-heading" className="text-lg font-semibold">
              Recent analyses
            </h2>
            <Link
              href="/dashboard/history"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline underline-offset-4 md:min-h-0"
            >
              All of History <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <ScrollRegion label="Table of recent analyses" className="mt-2">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <caption className="sr-only">
                Your most recent analyses, with the score, the credits each one cost and a link to the report
              </caption>
              <thead>
                <tr className="border-b-2 border-foreground text-sm">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Resume and job
                  </th>
                  <th scope="col" className="w-24 py-2 pr-4 text-right font-semibold">
                    Score
                  </th>
                  <th scope="col" className="hidden w-24 py-2 pr-4 text-right font-semibold sm:table-cell">
                    Credits
                  </th>
                  <th scope="col" className="w-36 py-2 text-right font-semibold">
                    Next
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((m) => {
                  const score = m.overall_score_percent ?? 0;
                  const band = scoreBand(score);
                  const credits = creditsFor(m.id, creditHistory);
                  return (
                    <tr key={m.id} className="align-top">
                      <td className="max-w-0 py-3 pr-4">
                        <p className="truncate text-base font-semibold">
                          {m.resume_file_name ?? "Resume"}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{postingLine(m)}</p>
                        <p className="text-sm text-muted-foreground">
                          {m.mode === "recruiter" ? "Screener" : "Job Fit"}
                          {m.created_at && <> · {formatDate(m.created_at)}</>}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className={cn("text-lg font-bold tabular-nums", SCORE_TEXT[band.tone])}>
                          {score}%
                        </span>
                        <span className="block text-sm text-muted-foreground">{band.label}</span>
                      </td>
                      <td className="hidden py-3 pr-4 text-right text-base tabular-nums sm:table-cell">
                        {credits === null ? (
                          <span className="text-muted-foreground">
                            <span aria-hidden>{"–"}</span>
                            <span className="sr-only">not in the recent ledger</span>
                          </span>
                        ) : credits === 0 ? (
                          <span className="text-muted-foreground">returned</span>
                        ) : (
                          <span className="font-semibold">{signed(credits)}</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/dashboard/reports/${m.id}`}
                            aria-label={`Open the report for ${m.resume_file_name ?? "this resume"}`}
                          >
                            Open report <ArrowRight />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        </section>
      )}
    </div>
  );
}

/** First visit: say what each desk is for and what it costs, then get out of the way. */
function FirstRun() {
  const { credits } = useDashboardData();
  const match = credits?.costs.match ?? 1;
  const perResume = credits?.costs.screening_per_resume ?? 1;
  return (
    <section aria-labelledby="first-run" className="border-t border-border pt-8">
      <h2 id="first-run" className="text-lg font-semibold">
        Nothing analyzed yet
      </h2>
      <p className="mt-1 max-w-prose text-base text-muted-foreground">
        Uploading resumes and adding job postings is free. You spend a credit only when
        something is analyzed, and the price is shown first.
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2 md:divide-x md:divide-border">
        <div className="max-w-sm space-y-2 md:pr-8">
          <h3 className="font-semibold">You have a resume and a job you want</h3>
          <p className="text-base text-muted-foreground">
            See what already matches, what is missing, and which lines to reword before you
            apply. {plural(match, "credit")} per analysis.
          </p>
          <Button asChild className="mt-2">
            <Link href="/dashboard/match">
              Start Job Fit <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="max-w-sm space-y-2 md:pl-8">
          <h3 className="font-semibold">You have a stack of resumes and one opening</h3>
          <p className="text-base text-muted-foreground">
            Get them ranked, with a short reason for each position. {plural(perResume, "credit")}{" "}
            per resume; a resume that cannot be read is refunded.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/dashboard/screen">
              Start the Screener <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function LedgerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your analyses" className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-px">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-6 border-b border-border py-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
