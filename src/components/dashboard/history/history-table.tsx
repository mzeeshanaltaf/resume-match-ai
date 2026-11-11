"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowRight, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type { JobDescriptionOut, MatchListItem, ResumeOut } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { SCORE_TEXT, scoreBand } from "@/lib/score";
import { cn } from "@/lib/utils";
import {
  JdPreviewDialog,
  safeUrl,
  type JdPreviewTarget,
} from "@/components/dashboard/jd-preview-dialog";
import { ScrollRegion } from "@/components/dashboard/scroll-region";
import { ResumePreviewDialog, type PreviewTarget } from "./resume-preview-dialog";

type Tab = "job_fit" | "screener";
type SortField = "score" | "date";
type SortDir = "asc" | "desc";

export function HistoryTable({
  matches,
  resumes,
  jds,
  defaultTab = "job_fit",
}: {
  matches: MatchListItem[];
  resumes: ResumeOut[];
  jds: JobDescriptionOut[];
  defaultTab?: Tab;
}) {
  const { removeMatch, refreshAll } = useDashboardData();

  const resumeMap = useMemo(() => new Map(resumes.map((r) => [r.id, r])), [resumes]);
  const jdMap = useMemo(() => new Map(jds.map((j) => [j.id, j])), [jds]);

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [resumeTarget, setResumeTarget] = useState<PreviewTarget | null>(null);
  const [jdTarget, setJdTarget] = useState<JdPreviewTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MatchListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const jobFit = matches.filter((m) => m.mode === "candidate");
  const screener = matches.filter((m) => m.mode === "recruiter");
  const tabMatches = tab === "job_fit" ? jobFit : screener;

  const q = filter.trim().toLowerCase();
  const rows = tabMatches
    .filter(
      (m) =>
        !q ||
        [m.resume_file_name, m.jd_url, m.company_name, m.job_title].some((v) =>
          v?.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "score") {
        return ((a.overall_score_percent ?? 0) - (b.overall_score_percent ?? 0)) * dir;
      }
      return (
        (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()) * dir
      );
    });

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  async function remove(match: MatchListItem) {
    setDeletingId(match.id);
    try {
      // Removes only this analysis; the resume and the posting stay.
      await api.matches.remove(match.id);
      removeMatch(match.id);
      toast.success("Analysis deleted. Your resume and the posting were kept.");
      refreshAll();
    } catch (err) {
      toast.error(describeError(err, "The analysis could not be deleted."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Tabs
      value={tab}
      className="min-w-0 gap-0"
      onValueChange={(v) => {
        setTab(v as Tab);
        setFilter("");
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line" aria-label="Which tool">
          <TabsTrigger value="job_fit">Job Fit ({jobFit.length})</TabsTrigger>
          <TabsTrigger value="screener">Screener ({screener.length})</TabsTrigger>
        </TabsList>

        <div className="relative w-full sm:w-72">
          <label htmlFor="history-filter" className="sr-only">
            Filter by resume or job
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="history-filter"
            placeholder="Filter by resume or job"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Both panels stay in the DOM so each tab's aria-controls points at a real element. */}
      {(["job_fit", "screener"] as const).map((t) => (
        <TabsContent key={t} value={t} forceMount className="min-w-0 outline-none">
      {t === tab && (rows.length === 0 ? (
        <div className="mt-10 max-w-md">
          <h2 className="text-lg font-semibold">
            {q ? "Nothing matches that filter" : `No ${tab === "job_fit" ? "Job Fit" : "Screener"} analyses yet`}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            {q
              ? "Check the spelling, or clear the filter to see everything."
              : tab === "job_fit"
                ? "Read a resume against a job posting and the report will be kept here."
                : "Score a stack of resumes against a posting and every report will be kept here."}
          </p>
          {q ? (
            <Button variant="outline" className="mt-4" onClick={() => setFilter("")}>
              Clear the filter
            </Button>
          ) : (
            <Button asChild className="mt-4">
              <Link href={tab === "job_fit" ? "/dashboard/match" : "/dashboard/screen"}>
                {tab === "job_fit" ? "Start Job Fit" : "Start the Screener"} <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ScrollRegion label="Past analyses" className="mt-4">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Your past analyses</caption>
            <thead>
              <tr className="border-b-2 border-foreground text-sm">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Resume
                </th>
                <th scope="col" className="hidden py-2 pr-4 font-semibold md:table-cell">
                  Job
                </th>
                <SortHeader
                  label="Score"
                  field="score"
                  active={sortField}
                  dir={sortDir}
                  onSort={toggleSort}
                  className="w-24 text-right"
                />
                <SortHeader
                  label="Date"
                  field="date"
                  active={sortField}
                  dir={sortDir}
                  onSort={toggleSort}
                  className="hidden w-32 md:table-cell"
                />
                <th scope="col" className="w-12 py-2 text-right font-semibold sm:w-40">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((m) => {
                const score = m.overall_score_percent ?? 0;
                const band = scoreBand(score);
                const resume = resumeMap.get(m.resume_id);
                const jdRecord = m.jd_id ? jdMap.get(m.jd_id) : undefined;
                const fileName = m.resume_file_name ?? "Resume";
                const deleting = deletingId === m.id;
                const hasJob = !!(m.company_name || m.job_title || m.jd_url || jdRecord);
                return (
                  <tr key={m.id} className={cn("align-top", deleting && "opacity-50")}>
                    <td className="max-w-0 py-3 pr-4">
                      {resume ? (
                        <button
                          type="button"
                          onClick={() =>
                            setResumeTarget({
                              id: resume.id,
                              fileName: resume.file_name ?? fileName,
                              mimeType: resume.mime_type,
                            })
                          }
                          className="block max-w-full truncate rounded-sm text-left text-base font-semibold underline decoration-border decoration-2 underline-offset-4 hover:decoration-foreground"
                          title="Preview this resume"
                        >
                          {fileName}
                        </button>
                      ) : (
                        <span className="block truncate text-base font-semibold">{fileName}</span>
                      )}
                      <span className="block truncate text-sm text-muted-foreground md:hidden">
                        {[m.job_title ?? m.company_name, formatDate(m.created_at)].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="hidden max-w-0 py-3 pr-4 md:table-cell">
                      {hasJob ? (
                        <button
                          type="button"
                          onClick={() =>
                            setJdTarget({
                              jd: jdRecord?.jd_object ?? null,
                              url: safeUrl(m.jd_url ?? jdRecord?.jd_url),
                            })
                          }
                          className="block w-full min-w-0 rounded-sm text-left"
                          title="Read the job posting"
                        >
                          <span className="block truncate text-base underline decoration-border decoration-2 underline-offset-4 hover:decoration-foreground">
                            {m.job_title ?? m.company_name ?? m.jd_url}
                          </span>
                          {m.job_title && m.company_name && (
                            <span className="block truncate text-sm text-muted-foreground">
                              {m.company_name}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">
                          <span aria-hidden>{"–"}</span>
                          <span className="sr-only">No posting kept</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={cn("text-lg font-bold tabular-nums", SCORE_TEXT[band.tone])}>
                        {score}%
                      </span>
                      <span className="block text-sm text-muted-foreground">{band.label}</span>
                    </td>
                    <td className="hidden py-3 pr-4 text-sm text-muted-foreground md:table-cell">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/dashboard/reports/${m.id}`}
                            aria-label={`Open the report for ${fileName}`}
                          >
                            Open report
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-pencil"
                          onClick={() => setPendingDelete(m)}
                          disabled={deleting}
                          aria-label={`Delete the analysis for ${fileName}`}
                        >
                          {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      ))}
        </TabsContent>
      ))}

      <ResumePreviewDialog target={resumeTarget} onClose={() => setResumeTarget(null)} />
      <JdPreviewDialog target={jdTarget} onClose={() => setJdTarget(null)} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              The report
              {pendingDelete?.resume_file_name ? ` for “${pendingDelete.resume_file_name}”` : ""}
              , with any bullets and cover letters made from it, will be erased. Your resume
              and the job posting are kept. The credit it cost is not returned. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (pendingDelete) {
                  remove(pendingDelete);
                  setPendingDelete(null);
                }
              }}
            >
              Delete analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

function SortHeader({
  label,
  field,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  active: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const current = active === field;
  const Icon = !current ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("py-2 pr-4 font-semibold", className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </th>
  );
}
