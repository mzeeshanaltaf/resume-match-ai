"use client";

import { FileText, Plus, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResumeUpload } from "@/components/dashboard/match/resume-upload";
import type { ResumeRecord } from "@/types/n8n";

interface MultiResumePickerProps {
  onNext: (fileIds: string[], resumes: ResumeRecord[]) => void;
  resumes: ResumeRecord[];
  selectedIds: string[];
  showUpload: boolean;
  onResumesChange: (resumes: ResumeRecord[]) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onShowUploadChange: (show: boolean) => void;
}

export function MultiResumePicker({
  onNext,
  resumes,
  selectedIds,
  showUpload,
  onResumesChange,
  onSelectedIdsChange,
  onShowUploadChange,
}: MultiResumePickerProps) {
  function toggle(fileId: string) {
    const set = new Set(selectedIds);
    if (set.has(fileId)) set.delete(fileId);
    else set.add(fileId);
    onSelectedIdsChange(Array.from(set));
  }

  function selectAll() {
    if (selectedIds.length === resumes.length) {
      onSelectedIdsChange([]);
    } else {
      onSelectedIdsChange(resumes.map((r) => r.file_id));
    }
  }

  function handleUploaded(resume: ResumeRecord) {
    onResumesChange([resume, ...resumes]);
    onSelectedIdsChange([...selectedIds, resume.file_id]);
    onShowUploadChange(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Upload resumes to screen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload one or more resumes to match against the job description.
        </p>
      </div>

      {/* Actions */}
      {resumes.length > 1 && (
        <Button variant="ghost" size="sm" onClick={selectAll} className="gap-2 -ml-2">
          {selectedIds.length === resumes.length ? (
            <><CheckSquare className="h-4 w-4" /> Deselect all</>
          ) : (
            <><Square className="h-4 w-4" /> Select all ({resumes.length})</>
          )}
        </Button>
      )}

      {/* Resume grid */}
      {resumes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map((r) => {
            const selected = selectedIds.includes(r.file_id);
            return (
              <button
                key={r.file_id}
                onClick={() => toggle(r.file_id)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
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
                  <p className="truncate text-sm font-medium">{r.file_name}</p>
                  {r.file_size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {(r.file_size / 1024).toFixed(0)} KB
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Upload */}
      {showUpload ? (
        <div className="rounded-lg border border-border p-4">
          <ResumeUpload
            onUploaded={handleUploaded}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
            isCandidate={false}
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
            const selected = resumes.filter((r) => selectedIds.includes(r.file_id));
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
