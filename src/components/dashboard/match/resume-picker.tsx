"use client";

import { FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResumeUpload } from "./resume-upload";
import type { ResumeRecord } from "@/types/n8n";

interface ResumePickerProps {
  onNext: (fileId: string) => void;
  resumes: ResumeRecord[];
  selectedId: string | null;
  showUpload: boolean;
  onResumesChange: (resumes: ResumeRecord[]) => void;
  onSelectedIdChange: (id: string | null) => void;
  onShowUploadChange: (show: boolean) => void;
}

export function ResumePicker({
  onNext,
  resumes,
  selectedId,
  showUpload,
  onResumesChange,
  onSelectedIdChange,
  onShowUploadChange,
}: ResumePickerProps) {
  function handleUploaded(resume: ResumeRecord) {
    onResumesChange([resume, ...resumes]);
    onSelectedIdChange(resume.file_id);
    onShowUploadChange(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Upload your resume</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a PDF resume to analyze against the job description.
        </p>
      </div>

      {/* Uploaded resumes */}
      {resumes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map((r, i) => (
            <button
              key={r.file_id || `resume-${i}`}
              onClick={() => { onSelectedIdChange(r.file_id); onShowUploadChange(false); }}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                selectedId === r.file_id
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
              )}
            >
              <FileText
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  selectedId === r.file_id
                    ? "text-emerald-500"
                    : "text-muted-foreground"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.file_name}</p>
                {r.file_size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {(r.file_size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>
              {selectedId === r.file_id && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Upload area */}
      {showUpload && (
        <div className="rounded-lg border border-border p-4">
          <ResumeUpload
            onUploaded={handleUploaded}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
          />
        </div>
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
