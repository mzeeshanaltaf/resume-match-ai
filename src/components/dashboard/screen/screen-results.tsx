"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type { ScreeningResult } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { SCORE_TEXT, scoreBand } from "@/lib/score";
import { cn } from "@/lib/utils";
import { ErrorNote } from "@/components/dashboard/notes";
import { ScrollRegion } from "@/components/dashboard/scroll-region";

/**
 * The ranked pile. Each row opens that candidate's full report; the same
 * reports are in History. A failed resume is listed with its reason, and its
 * credit has already been returned.
 */
export function ScreenResults({
  result,
  onReset,
}: {
  result: ScreeningResult;
  onReset: () => void;
}) {
  // The backend ranks them; sorting again keeps this robust to ties.
  const ranked = [...result.ranked].sort((a, b) => a.rank - b.rank);
  const failed = result.failed;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Ranking</h2>
        <p className="mt-1 text-base text-muted-foreground">
          {plural(ranked.length, "resume")} scored
          {failed.length > 0 && `, ${failed.length} could not be`}. Highest fit first.
          {result.refunded_credits > 0 &&
            ` ${plural(result.refunded_credits, "credit")} came back for the ${failed.length === 1 ? "resume" : "resumes"} that failed.`}
        </p>
      </div>

      {ranked.length > 0 && (
        <ScrollRegion label="Ranked resumes">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <caption className="sr-only">Resumes ranked by fit with the job posting</caption>
            <thead>
              <tr className="border-b-2 border-foreground text-sm">
                <th scope="col" className="w-12 py-2 pr-3 font-semibold">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Resume and reason
                </th>
                <th scope="col" className="w-36 py-2 pr-4 text-right font-semibold">
                  Score
                </th>
                <th scope="col" className="w-32 py-2 text-right font-semibold">
                  <span className="sr-only">Report</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ranked.map((item) => {
                const band = scoreBand(item.overall_score_percent);
                return (
                  <tr key={item.match_id} className="align-top">
                    <td className="py-3 pr-3 text-lg font-bold tabular-nums">{item.rank}</td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold">{item.file_name ?? "Resume"}</p>
                      {item.rationale && (
                        <p className="mt-1 max-w-prose text-muted-foreground">{item.rationale}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          SCORE_TEXT[band.tone],
                        )}
                      >
                        {item.overall_score_percent}%
                      </span>
                      <span className="block whitespace-nowrap text-sm text-muted-foreground">
                        {item.score_confidence} confidence
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/dashboard/reports/${item.match_id}`}
                          aria-label={`Open the report for ${item.file_name ?? "this resume"}`}
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
      )}

      {failed.length > 0 && (
        <ErrorNote title={`${plural(failed.length, "resume")} could not be scored`}>
          <ul className="space-y-1">
            {failed.map((item) => (
              <li key={item.resume_id}>
                <span className="font-semibold">{item.file_name ?? "Resume"}:</span>{" "}
                {describeError(
                  new ApiError(0, item.error.code, item.error.message, item.error.details ?? null),
                )}
              </li>
            ))}
          </ul>
        </ErrorNote>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw /> Screen another stack
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard/history?tab=screener">See all screenings</Link>
        </Button>
      </div>
    </section>
  );
}
