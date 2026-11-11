"use client";

import { useRef, useState, DragEvent } from "react";
import { Upload, FileText, X, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, isApiError, waitForJob } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import {
  MAX_RESUME_PAGES,
  MAX_UPLOAD_MB,
  RESUME_ACCEPT,
  RESUME_FORMATS_LABEL,
  checkResumeFile,
} from "@/lib/api/limits";
import type { JobStep, Mode, ResumeJobResult, ResumeOut } from "@/lib/api/types";
import { useDashboardData } from "@/contexts/dashboard-data";
import { ShimmeringProgressDialog } from "@/components/dashboard/shimmering-progress-dialog";

interface ResumeUploadProps {
  onUploaded: (resume: ResumeOut) => void;
  onCancel?: () => void;
  /** `candidate` for Job Fit, `recruiter` for the Resume Screener. */
  mode?: Mode;
  buttonLabel?: string;
}

export function ResumeUpload({
  onUploaded,
  onCancel,
  mode = "candidate",
  buttonLabel = "Process resume",
}: ResumeUploadProps) {
  const { addResume } = useDashboardData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [dragging, setDragging] = useState(false);

  function handleFile(f: File) {
    const problem = checkResumeFile(f);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setSteps([]);
    try {
      const { job_id } = await api.resumes.upload(file, mode);
      const result = await waitForJob<ResumeJobResult>(job_id, { onSteps: setSteps });
      addResume(result.resume);
      toast.success("Resume uploaded successfully.");
      onUploaded(result.resume);
    } catch (err) {
      if (isApiError(err, "DUPLICATE_RESUME")) {
        // Same file already stored for this tool: use that copy instead of failing.
        const existing = await findExisting(err.details?.resume_id);
        if (existing) {
          addResume(existing);
          toast.info("You've already uploaded this file. Using the existing copy.");
          onUploaded(existing);
          return;
        }
      }
      toast.error(describeError(err, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
    <ShimmeringProgressDialog open={uploading} title="Processing Resume" steps={steps} />
    <div className="space-y-4">
      {!file ? (
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors",
            dragging
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
              : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Drop your resume here or click to browse</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {RESUME_FORMATS_LABEL} · max {MAX_UPLOAD_MB} MB · up to {MAX_RESUME_PAGES} pages
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={RESUME_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = ""; // allow re-picking the same file after a rejection
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <FileText className="h-8 w-8 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            onClick={() => setFile(null)}
            aria-label="Remove file"
            className="ml-2 rounded-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={upload}
          disabled={!file || uploading}
          size="sm"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          <><Cpu className="h-4 w-4" /> {buttonLabel}</>

        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
    </>
  );
}

async function findExisting(id: unknown): Promise<ResumeOut | null> {
  if (typeof id !== "string") return null;
  try {
    return (await api.resumes.list()).find((r) => r.id === id) ?? null;
  } catch {
    return null;
  }
}
