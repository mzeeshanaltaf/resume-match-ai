"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";
import { resumeMeta } from "@/lib/format";
import type { Mode, ResumeOut } from "@/lib/api/types";
import { ErrorNote } from "@/components/dashboard/notes";
import { ResumeUpload } from "./resume-upload";

/** One resume as a selectable row: a native radio or checkbox inside a label. */
function ResumeRow({
  resume,
  type,
  name,
  checked,
  disabled,
  onChange,
}: {
  resume: ResumeOut;
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <li>
      <label
        className="flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-accent has-[:checked]:bg-proof-wash has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring"
      >
        <input
          type={type}
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="mt-1 size-4 shrink-0 accent-proof"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">
            {resume.file_name ?? "Resume"}
          </span>
          <span className="block text-sm text-muted-foreground">{resumeMeta(resume)}</span>
        </span>
      </label>
    </li>
  );
}

function useResumes(mode: Mode) {
  const { resumes: all, loading, error, refreshAll } = useDashboardData();
  // Each tool only works with resumes that were added for it.
  const resumes = useMemo(() => (all ?? []).filter((r) => r.mode === mode), [all, mode]);
  return { resumes, loading, error, refreshAll, loaded: all !== null };
}

function ListSkeleton() {
  return (
    <div className="space-y-px overflow-hidden rounded-md border border-border" aria-busy="true">
      <Skeleton className="h-[4.5rem] rounded-none" />
      <Skeleton className="h-[4.5rem] rounded-none" />
    </div>
  );
}

function LoadFailed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <ErrorNote
      title="Your resumes did not load"
      actions={
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      }
    >
      {message}
    </ErrorNote>
  );
}

/* ─── Job Fit: pick one ──────────────────────────────────────────────────── */

export function ResumePicker({
  selectedId,
  showUpload,
  onSelectedIdChange,
  onShowUploadChange,
  onNext,
}: {
  selectedId: string | null;
  /** null = decide from the list: show the upload form only when there are no resumes yet. */
  showUpload: boolean | null;
  onSelectedIdChange: (id: string | null) => void;
  onShowUploadChange: (show: boolean) => void;
  onNext: (resumeId: string) => void;
}) {
  const { resumes, loading, error, refreshAll, loaded } = useResumes("candidate");
  const uploadVisible = showUpload ?? (loaded && resumes.length === 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          {resumes.length > 0 ? "Choose your resume" : "Add your resume"}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {resumes.length > 0
            ? "Use one you already added, or add another."
            : "Upload the resume you want checked against the job."}
        </p>
      </div>

      {loading && <ListSkeleton />}
      {!loading && !loaded && error && <LoadFailed message={error} retry={refreshAll} />}

      {resumes.length > 0 && (
        <fieldset>
          <legend className="sr-only">Your resumes</legend>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {resumes.map((r) => (
              <ResumeRow
                key={r.id}
                resume={r}
                type="radio"
                name="resume"
                checked={selectedId === r.id}
                onChange={() => {
                  onSelectedIdChange(r.id);
                  onShowUploadChange(false);
                }}
              />
            ))}
          </ul>
        </fieldset>
      )}

      {uploadVisible ? (
        <div className="rounded-md border border-border p-4">
          <ResumeUpload
            mode="candidate"
            onUploaded={(resume) => {
              onSelectedIdChange(resume.id);
              onShowUploadChange(false);
            }}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
          />
        </div>
      ) : (
        loaded && (
          <Button variant="outline" onClick={() => onShowUploadChange(true)}>
            <Plus /> Add another resume
          </Button>
        )
      )}

      <div className="pt-1">
        <Button disabled={!selectedId} onClick={() => selectedId && onNext(selectedId)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

/* ─── Screener: pick several ─────────────────────────────────────────────── */

export function MultiResumePicker({
  max,
  selectedIds,
  showUpload,
  onSelectedIdsChange,
  onShowUploadChange,
  onNext,
}: {
  max: number;
  selectedIds: string[];
  showUpload: boolean | null;
  onSelectedIdsChange: (ids: string[]) => void;
  onShowUploadChange: (show: boolean) => void;
  onNext: (resumeIds: string[]) => void;
}) {
  const { resumes, loading, error, refreshAll, loaded } = useResumes("recruiter");
  const uploadVisible = showUpload ?? (loaded && resumes.length === 0);
  const atLimit = selectedIds.length >= max;
  const selectable = resumes.slice(0, max);
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selectedIds.includes(r.id));

  function toggle(id: string) {
    if (selectedIds.includes(id)) onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    else if (!atLimit) onSelectedIdsChange([...selectedIds, id]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          {resumes.length > 0 ? "Choose the resumes to screen" : "Add the resumes to screen"}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          Up to {max} at a time. Each one is scored against the same job posting.
        </p>
      </div>

      {loading && <ListSkeleton />}
      {!loading && !loaded && error && <LoadFailed message={error} retry={refreshAll} />}

      {resumes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {selectedIds.length} of {Math.min(resumes.length, max)} selected
              {atLimit && ` (the most you can screen at once)`}
            </p>
            {resumes.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectedIdsChange(allSelected ? [] : selectable.map((r) => r.id))}
              >
                {allSelected ? "Clear selection" : "Select all"}
              </Button>
            )}
          </div>
          <fieldset>
            <legend className="sr-only">Resumes to screen</legend>
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              {resumes.map((r) => {
                const checked = selectedIds.includes(r.id);
                return (
                  <ResumeRow
                    key={r.id}
                    resume={r}
                    type="checkbox"
                    name={`resume-${r.id}`}
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggle(r.id)}
                  />
                );
              })}
            </ul>
          </fieldset>
        </div>
      )}

      {uploadVisible ? (
        <div className="rounded-md border border-border p-4">
          <ResumeUpload
            mode="recruiter"
            onUploaded={(resume) => {
              if (!selectedIds.includes(resume.id) && !atLimit) {
                onSelectedIdsChange([...selectedIds, resume.id]);
              }
              onShowUploadChange(false);
            }}
            onCancel={resumes.length > 0 ? () => onShowUploadChange(false) : undefined}
          />
        </div>
      ) : (
        loaded && (
          <Button variant="outline" onClick={() => onShowUploadChange(true)}>
            <Plus /> Add another resume
          </Button>
        )
      )}

      <div className="pt-1">
        <Button disabled={selectedIds.length === 0} onClick={() => onNext(selectedIds)}>
          Continue with {selectedIds.length || "no"} {selectedIds.length === 1 ? "resume" : "resumes"}
        </Button>
      </div>
    </div>
  );
}
