"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, AlertCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumeMatchResponse } from "@/types/n8n";

export type ScreenResultItem = {
  file_id: string;
  file_name: string;
  status: "success" | "error";
  result?: ResumeMatchResponse;
};

function getScore(result: ResumeMatchResponse): number {
  return result.job_match_summary?.match_summary?.overall_score_percent ?? 0;
}

function getConfidence(result: ResumeMatchResponse): string {
  return result.job_match_summary?.match_summary?.score_confidence ?? "unknown";
}

function getRationale(result: ResumeMatchResponse): string {
  const ms = result.job_match_summary?.match_summary;
  if (ms?.rationale) return ms.rationale;
  if (ms?.key_strengths?.length) return ms.key_strengths[0].strength;
  if (ms?.critical_gaps?.length) return ms.critical_gaps[0].gap;
  return "";
}

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
  items: ScreenResultItem[];
  onReset: () => void;
}

export function ScreenResults({ items, onReset }: ScreenResultsProps) {
  const router = useRouter();
  const successful = items
    .filter((i): i is ScreenResultItem & { status: "success"; result: ResumeMatchResponse } =>
      i.status === "success" && !!i.result
    )
    .sort((a, b) => getScore(b.result) - getScore(a.result));

  const failed = items.filter((i) => i.status === "error");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Screening Results</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {successful.length} resume{successful.length !== 1 ? "s" : ""} screened
          {failed.length > 0 && `, ${failed.length} failed`}
          . Ranked by match score.
        </p>
      </div>

      {successful.length > 0 && (
        <div className="space-y-3">
          {successful.map((item, i) => {
            const score = getScore(item.result);
            const conf = getConfidence(item.result);
            const rationale = getRationale(item.result);
            return (
              <div key={item.file_id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{item.file_name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className={cn("text-xs font-bold", scoreBadge(score))}>
                      {score}%
                    </Badge>
                    <span className={cn("text-xs font-semibold capitalize", confidenceClass(conf))}>
                      {conf}
                    </span>
                  </div>
                </div>
                {rationale && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rationale}
                  </p>
                )}
              </div>
            );
          })}
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
              <li key={item.file_id} className="text-xs text-muted-foreground">
                {item.file_name}
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
