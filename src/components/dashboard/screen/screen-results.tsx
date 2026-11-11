"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, AlertCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type { ScreeningResult } from "@/lib/api/types";

function scoreBadge(score: number) {
  if (score >= 75) return "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300";
  if (score >= 50) return "border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400";
  return "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400";
}

function confidenceClass(conf: string) {
  switch (conf.toLowerCase()) {
    case "high":
      return "text-emerald-600 dark:text-emerald-400";
    case "medium":
      return "text-yellow-600 dark:text-yellow-400";
    default:
      return "text-red-500 dark:text-red-400";
  }
}

interface ScreenResultsProps {
  result: ScreeningResult;
  onReset: () => void;
}

export function ScreenResults({ result, onReset }: ScreenResultsProps) {
  const router = useRouter();
  // The backend already ranks them; sorting again keeps this robust to ties.
  const ranked = [...result.ranked].sort((a, b) => a.rank - b.rank);
  const failed = result.failed;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Screening Results</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ranked.length} resume{ranked.length !== 1 ? "s" : ""} screened
          {failed.length > 0 && `, ${failed.length} failed`}
          . Ranked by match score.
          {result.refunded_credits > 0 &&
            ` ${result.refunded_credits} credit${result.refunded_credits === 1 ? " was" : "s were"} refunded for the failed ${failed.length === 1 ? "resume" : "resumes"}.`}
        </p>
      </div>

      {ranked.length > 0 && (
        <div className="space-y-3">
          {ranked.map((item) => (
            <div key={item.match_id} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {item.rank}
                  </span>
                  <span className="text-sm font-medium truncate">{item.file_name ?? "Resume"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={cn("text-xs font-bold", scoreBadge(item.overall_score_percent))}>
                    {item.overall_score_percent}%
                  </Badge>
                  <span className={cn("text-xs font-semibold capitalize", confidenceClass(item.score_confidence))}>
                    {item.score_confidence}
                  </span>
                </div>
              </div>
              {item.rationale && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.rationale}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Failed items */}
      {failed.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {failed.length} resume{failed.length !== 1 ? "s" : ""} could not be analyzed
            </span>
          </div>
          <ul className="space-y-1">
            {failed.map((item) => (
              <li key={item.resume_id} className="text-xs text-muted-foreground">
                {item.file_name ?? "Resume"}:{" "}
                {describeError(
                  new ApiError(0, item.error.code, item.error.message, item.error.details ?? null)
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          New screening
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => router.push("/dashboard/history?tab=screener")}
        >
          <History className="h-4 w-4" />
          History
        </Button>
      </div>
    </div>
  );
}
