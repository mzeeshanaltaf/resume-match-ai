"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api, isAbortError, isApiError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type { GeneratedDocumentOut, MatchOut } from "@/lib/api/types";
import { ErrorNote } from "@/components/dashboard/notes";
import {
  ResumePreviewDialog,
  type PreviewTarget,
} from "@/components/dashboard/history/resume-preview-dialog";
import {
  JdPreviewDialog,
  safeUrl,
  type JdPreviewTarget,
} from "@/components/dashboard/jd-preview-dialog";
import { MatchReport } from "./match-report";
import { BulletsPanel, CoverLetterPanel } from "./generated-panels";
import { ReportPanel, ReportTabs, type ReportTab } from "./report-tabs";

export type ReportTabId = "analysis" | "bullets" | "letter";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; match: MatchOut }
  | { status: "error"; error: unknown };

/** `/dashboard/reports/[id]`: one analysis as a full page, with its generated documents. */
export function ReportPage({ id, initialTab }: { id: string; initialTab: ReportTabId }) {
  const { jds, resumes } = useDashboardData();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<ReportTabId>(initialTab);
  const [resumeTarget, setResumeTarget] = useState<PreviewTarget | null>(null);
  const [jdTarget, setJdTarget] = useState<JdPreviewTarget | null>(null);
  const idPrefix = useId();

  const load = useCallback(
    (signal?: AbortSignal) => {
      api.matches
        .get(id, signal)
        .then((match) => setState({ status: "ready", match }))
        .catch((error) => {
          if (isAbortError(error)) return;
          setState({ status: "error", error });
        });
    },
    [id],
  );

  useEffect(() => {
    setState({ status: "loading" });
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const addDocument = useCallback((doc: GeneratedDocumentOut) => {
    setState((s) =>
      s.status === "ready"
        ? {
            status: "ready",
            match: {
              ...s.match,
              documents: [...s.match.documents.filter((d) => d.id !== doc.id), doc],
            },
          }
        : s,
    );
  }, []);

  const match = state.status === "ready" ? state.match : null;
  const isRecruiter = match?.mode === "recruiter";
  const jdRecord = useMemo(
    () => (match?.jd_id ? jds?.find((j) => j.id === match.jd_id) : undefined),
    [jds, match?.jd_id],
  );
  const resume = match ? resumes?.find((r) => r.id === match.resume_id) : undefined;

  const backHref = isRecruiter ? "/dashboard/history?tab=screener" : "/dashboard/history";

  const hasBullets = !!match?.documents.some((d) => d.kind === "tailored_bullets");
  const letters = match?.documents.filter((d) => d.kind === "cover_letter").length ?? 0;
  const tabs: ReportTab[] = [
    { id: "analysis", label: "Analysis" },
    { id: "bullets", label: "Tailored bullets", hint: hasBullets ? "ready" : undefined },
    { id: "letter", label: "Cover letter", hint: letters ? "ready" : undefined },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* The page's own heading, for every tab and for the loading/error states. */}
      <h1 className="sr-only">
        {match ? `Report: ${match.job_title ?? jdRecord?.jd_object?.job_title ?? "job posting"}` : "Report"}
      </h1>

      {/* Actions: screen only; the printed page is the document alone. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link href={backHref}>
            <ArrowLeft /> {isRecruiter ? "All screenings" : "History"}
          </Link>
        </Button>
        {match && (
          <div className="flex flex-wrap items-center gap-2">
            {resume && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setResumeTarget({
                    id: resume.id,
                    fileName: resume.file_name ?? match.resume_file_name ?? "Resume",
                    mimeType: resume.mime_type,
                  })
                }
              >
                <FileText /> <span className="sm:hidden">Resume</span><span className="hidden sm:inline">View resume</span>
              </Button>
            )}
            {(jdRecord || match.jd_url) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setJdTarget({
                    jd: jdRecord?.jd_object ?? null,
                    url: safeUrl(match.jd_url ?? jdRecord?.jd_url),
                  })
                }
              >
                <ExternalLink /> <span className="sm:hidden">Posting</span><span className="hidden sm:inline">View posting</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> <span className="sm:hidden">Print</span><span className="hidden sm:inline">Print or save as PDF</span>
            </Button>
          </div>
        )}
      </div>

      {state.status === "loading" && <ReportSkeleton />}

      {state.status === "error" && (
        <ErrorNote
          title={
            isApiError(state.error, "NOT_FOUND")
              ? "This report is gone"
              : "The report did not load"
          }
          actions={
            isApiError(state.error, "NOT_FOUND") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/history">Go to History</Link>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setState({ status: "loading" });
                  load();
                }}
              >
                Try again
              </Button>
            )
          }
        >
          {isApiError(state.error, "NOT_FOUND")
            ? "It was deleted, or it never belonged to this account."
            : describeError(state.error, "Could not load this report.")}
        </ErrorNote>
      )}

      {match && (
        <>
          {isRecruiter ? (
            <MatchReport match={match} jd={jdRecord?.jd_object} />
          ) : (
            <>
              <ReportTabs
                tabs={tabs}
                value={tab}
                onChange={(t) => setTab(t as ReportTabId)}
                idPrefix={idPrefix}
              />
              <ReportPanel id="analysis" idPrefix={idPrefix} active={tab === "analysis"}>
                <MatchReport match={match} jd={jdRecord?.jd_object} />
              </ReportPanel>
              <ReportPanel id="bullets" idPrefix={idPrefix} active={tab === "bullets"}>
                <BulletsPanel
                  match={match}
                  onGenerated={addDocument}
                  onConflict={() => load()}
                />
              </ReportPanel>
              <ReportPanel id="letter" idPrefix={idPrefix} active={tab === "letter"}>
                <CoverLetterPanel
                  match={match}
                  onGenerated={addDocument}
                  onConflict={() => load()}
                />
              </ReportPanel>
            </>
          )}
        </>
      )}

      <ResumePreviewDialog target={resumeTarget} onClose={() => setResumeTarget(null)} />
      <JdPreviewDialog target={jdTarget} onClose={() => setJdTarget(null)} />
    </div>
  );
}

/** A faint sheet while the report loads, so the page does not jump when it arrives. */
function ReportSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the report"
      className="rounded-page bg-page p-5 shadow-sheet sm:p-8 lg:p-10"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28 bg-page-rule" />
          <Skeleton className="h-8 w-72 max-w-full bg-page-rule" />
          <Skeleton className="h-5 w-48 bg-page-rule" />
        </div>
        <Skeleton className="h-16 w-24 bg-page-rule" />
      </div>
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-full bg-page-rule" style={{ width: `${95 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
