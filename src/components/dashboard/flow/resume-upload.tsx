"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, isAbortError, isApiError, waitForJob } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import {
  MAX_RESUME_PAGES,
  MAX_UPLOAD_MB,
  RESUME_ACCEPT,
  RESUME_FORMATS_LABEL,
  checkResumeFile,
} from "@/lib/api/limits";
import type { JobStep, Mode, ResumeJobResult, ResumeOut } from "@/lib/api/types";
import { formatSize } from "@/lib/format";
import { useDashboardData } from "@/contexts/dashboard-data";
import { StepList } from "@/components/dashboard/step-list";
import { ErrorNote } from "@/components/dashboard/notes";

/** The limits, stated where the file is chosen (the server enforces the same ones). */
export function UploadLimits({ id, className }: { id?: string; className?: string }) {
  return (
    <p id={id} className={cn("text-sm text-muted-foreground", className)}>
      {RESUME_FORMATS_LABEL}. Up to {MAX_UPLOAD_MB} MB and {MAX_RESUME_PAGES} pages. Scanned PDFs
      are read automatically. Uploading is free.
    </p>
  );
}

interface ResumeUploadProps {
  onUploaded: (resume: ResumeOut) => void;
  onCancel?: () => void;
  /** `candidate` for Job Fit, `recruiter` for the Resume Screener. */
  mode: Mode;
}

export function ResumeUpload({ onUploaded, onCancel, mode }: ResumeUploadProps) {
  const { addResume } = useDashboardData();
  const inputId = useId();
  const limitsId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function choose(f: File | undefined) {
    if (!f) return;
    const issue = checkResumeFile(f);
    if (issue) {
      setFile(null);
      setProblem(issue);
      return;
    }
    setProblem(null);
    setFile(f);
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    if (!working) choose(e.dataTransfer.files[0]);
  }

  async function upload() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setProblem(null);
    setSteps([]);
    try {
      const { job_id } = await api.resumes.upload(file, mode, controller.signal);
      const result = await waitForJob<ResumeJobResult>(job_id, {
        onSteps: setSteps,
        signal: controller.signal,
      });
      addResume(result.resume);
      onUploaded(result.resume);
    } catch (err) {
      if (isAbortError(err)) return;
      if (isApiError(err, "DUPLICATE_RESUME")) {
        // The same file is already stored for this tool: use that copy.
        const existing = await findExisting(err.details?.resume_id);
        if (existing) {
          addResume(existing);
          toast.info("You already uploaded this file. Using the copy you have.");
          onUploaded(existing);
          return;
        }
      }
      setProblem(describeError(err, "The upload failed. Please try again."));
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <UploadLimits id={limitsId} />

      {!file ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input bg-card px-4 py-10 text-center transition-colors hover:bg-accent",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
            dragging && "border-proof bg-proof-wash",
          )}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-base font-semibold">Choose a resume, or drop it here</span>
          <span className="text-sm text-muted-foreground">{RESUME_FORMATS_LABEL}</span>
          <input
            id={inputId}
            type="file"
            accept={RESUME_ACCEPT}
            aria-describedby={limitsId}
            className="sr-only"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = ""; // allow picking the same file again after a rejection
            }}
          />
        </label>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-sm text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          {!working && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setFile(null);
                setProblem(null);
              }}
              aria-label={`Remove ${file.name}`}
            >
              <X />
            </Button>
          )}
        </div>
      )}

      {problem && (
        <ErrorNote title="This file was not added">
          {problem}
          {!file && " Choose a different file to continue."}
        </ErrorNote>
      )}

      {working && (
        <StepList
          heading="Checking your resume"
          steps={steps}
          note="This takes a few seconds, longer for scanned pages."
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={upload} disabled={!file || working}>
          {working ? "Adding" : "Add resume"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
        )}
      </div>
    </div>
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
