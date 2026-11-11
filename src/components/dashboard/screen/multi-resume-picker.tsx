"use client";

import { useMemo } from "react";
import { Plus, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-data";
import { ResumeUpload } from "@/components/dashboard/match/resume-upload";
import { resumeMeta } from "@/components/dashboard/match/resume-picker";
import { MAX_SCREENING_RESUMES } from "@/lib/api/limits";
import type { ResumeOut } from "@/lib/api/types";

interface MultiResumePickerProps {
  onNext: (resumeIds: string[], resumes: ResumeOut[]) => void;
  selectedIds: string[];
  /** null = decide from the list: show the upload form only when there are no resumes yet. */
  showUpload: boolean | null;
  onSelectedIdsChange: (ids: string[]) => void;
  onShowUploadChange: (show: boolean) => void;
}

export function MultiResumePicker({
  onNext,
  selectedIds,
  showUpload,
  onSelectedIdsChange,
  onShowUploadChange,
}: MultiResumePickerProps) {
  const { resumes: all, loading } = useDashboardData();
  // The screener only works with resumes added in recruiter mode.
  const resumes = useMemo(
    () => (all ?? []).filter((r) => r.mode === "recruiter"),
    [all]
  );
  const uploadVisible = showUpload ?? resumes.length === 0;
  const atLimit = selectedIds.length >= MAX_SCREENING_RESUMES;

  function toggle(id: string) {
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else if (!atLimit) set.add(id);
    onSelectedIdsChange(Array.from(set));
  }

  const allSelected =
    resumes.length > 0 && resumes.slice(0, MAX_SCREENING_RESUMES).every((r) => selectedIds.includes(r.id));

  function selectAll() {
    onSelectedIdsChange(allSelected ? [] : resumes.slice(0, MAX_SCREENING_RESUMES).map((r) => r.id));
  }

  function handleUploaded(resume: ResumeOut) {
    if (!selectedIds.includes(resume.id) && !atLimit) {
      onSelectedIdsChange([...selectedIds, resume.id]);
    }
    onShowUploadChange(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          {resumes.length > 0 ? "Choose or upload resumes to screen" : "Upload resumes to screen"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select resumes you already uploaded, or add new ones, to match against the job
          description. Up to {MAX_SCREENING_RESUMES} at a time.
        </p>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      )}

      {/* Actions */}
      {resumes.length > 1 && (
        <Button variant="ghost" size="sm" onClick={selectAll} className="gap-2 -ml-2">
          {allSelected ? (
            <><CheckSquare className="h-4 w-4" /> Deselect all</>
          ) : (
            <><Square className="h-4 w-4" /> Select all ({Math.min(resumes.length, MAX_SCREENING_RESUMES)})</>
          )}
        </Button>
      )}

      {/* Resume grid */}
      {resumes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map((r) => {
            const selected = selectedIds.includes(r.id);
            const disabled = !selected && atLimit;
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id)}
                disabled={disabled}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  selected
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border"
                )}>
                  {selected && <CheckSquare className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.file_name ?? "Resume"}</p>
                  <p className="text-xs text-muted-foreground">{resumeMeta(r)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {atLimit && (
        <p className="text-xs text-muted-foreground">
          You&apos;ve selected the maximum of {MAX_SCREENING_RESUMES} resumes.
        </p>
      )}

      {/* Upload */}
      {uploadVisible ? (
        <div className="rounded-lg border border-border p-4">
          <ResumeUpload
            onUploaded={handleUploaded}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
            mode="recruiter"
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => onShowUploadChange(true)}>
          <Plus className="h-4 w-4" /> Upload another resume
        </Button>
      )}

      {/* Next */}
      <div className="pt-2">
        <Button
          disabled={selectedIds.length === 0}
          onClick={() => {
            const selected = resumes.filter((r) => selectedIds.includes(r.id));
            onNext(selectedIds, selected);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Continue ({selectedIds.length} selected)
        </Button>
      </div>
    </div>
  );
}
