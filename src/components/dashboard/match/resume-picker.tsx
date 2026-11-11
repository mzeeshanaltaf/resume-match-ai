"use client";

import { useMemo } from "react";
import { FileText, CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-data";
import { ResumeUpload } from "./resume-upload";
import type { ResumeOut } from "@/lib/api/types";

interface ResumePickerProps {
  onNext: (resumeId: string) => void;
  selectedId: string | null;
  /** null = decide from the list: show the upload form only when there are no resumes yet. */
  showUpload: boolean | null;
  onSelectedIdChange: (id: string | null) => void;
  onShowUploadChange: (show: boolean) => void;
}

export function resumeMeta(r: ResumeOut): string {
  const parts: string[] = [];
  if (r.file_size) parts.push(`${(r.file_size / 1024).toFixed(0)} KB`);
  if (r.num_pages) parts.push(`${r.num_pages} page${r.num_pages === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function ResumePicker({
  onNext,
  selectedId,
  showUpload,
  onSelectedIdChange,
  onShowUploadChange,
}: ResumePickerProps) {
  const { resumes: all, loading } = useDashboardData();
  // Job Fit only works with resumes added in candidate mode.
  const resumes = useMemo(
    () => (all ?? []).filter((r) => r.mode === "candidate"),
    [all]
  );
  const uploadVisible = showUpload ?? resumes.length === 0;

  function handleUploaded(resume: ResumeOut) {
    onSelectedIdChange(resume.id);
    onShowUploadChange(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          {resumes.length > 0 ? "Choose or upload your resume" : "Upload your resume"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a resume you already uploaded, or add a new one, to analyze against the job
          description.
        </p>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      )}

      {/* Existing resumes */}
      {resumes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => { onSelectedIdChange(r.id); onShowUploadChange(false); }}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                selectedId === r.id
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
              )}
            >
              <FileText
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  selectedId === r.id ? "text-emerald-500" : "text-muted-foreground"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.file_name ?? "Resume"}</p>
                <p className="text-xs text-muted-foreground">{resumeMeta(r)}</p>
              </div>
              {selectedId === r.id && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Upload area */}
      {uploadVisible ? (
        <div className="rounded-lg border border-border p-4">
          <ResumeUpload
            mode="candidate"
            onUploaded={handleUploaded}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => onShowUploadChange(true)}>
          <Plus className="h-4 w-4" /> Upload another resume
        </Button>
      )}

      {/* Next button */}
      <div className="pt-2">
        <Button
          disabled={!selectedId}
          onClick={() => selectedId && onNext(selectedId)}
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
