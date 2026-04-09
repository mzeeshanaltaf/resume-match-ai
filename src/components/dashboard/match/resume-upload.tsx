"use client";

import { useRef, useState, DragEvent } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ResumeRecord } from "@/types/n8n";
import { ShimmeringProgressDialog, type ProgressStep } from "@/components/dashboard/shimmering-progress-dialog";

const RESUME_STEPS: ProgressStep[] = [
  { message: "Analyzing Resume...", duration: 5000 },
  { message: "Extracting Details...", duration: 5000 },
  { message: "Almost there...", duration: Infinity },
];

interface ResumeUploadProps {
  onUploaded: (resume: ResumeRecord) => void;
  onCancel?: () => void;
  isCandidate?: boolean;
  buttonLabel?: string;
}

export function ResumeUpload({ onUploaded, onCancel, isCandidate = true, buttonLabel = "Upload resume" }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  function handleFile(f: File) {
    if (f.type !== "application/pdf") {
      toast.error("Only PDF files are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB.");
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
    try {
      const fd = new FormData();
      fd.append("file", file);
      const url = `/api/resume/upload?is_candidate=${isCandidate}`;
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Upload failed.");
      }
      const data = await res.json();
      toast.success("Resume uploaded successfully.");
      onUploaded({
        file_id: data.file_id,
        file_name: data.file_name || file.name,
        file_size: file.size,
        file_base64: "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
    <ShimmeringProgressDialog open={uploading} title="Processing Resume" steps={RESUME_STEPS} />
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
          <p className="text-sm font-medium">Drop your PDF here or click to browse</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF only · max 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4" /> {buttonLabel}</>
          )}
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
