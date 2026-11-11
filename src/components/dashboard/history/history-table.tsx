"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowUpDown,
  Trash2,
  Search,
  Loader2,
  Target,
  ScanSearch,
  FileText,
  ExternalLink,
  Building2,
  MapPin,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { MatchDetailDialog } from "./match-detail-dialog";
import { ResumePreviewDialog, type PreviewTarget } from "./resume-preview-dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { useDashboardData } from "@/contexts/dashboard-data";
import type {
  JobDescription,
  JobDescriptionOut,
  MatchListItem,
  ResumeOut,
} from "@/lib/api/types";

type Tab = "job_fit" | "screener";
type SortField = "match_score" | "created_at";
type SortDir = "asc" | "desc";

function getScore(match: MatchListItem): number {
  return match.overall_score_percent ?? 0;
}


function scoreBadgeClass(score: number) {
  if (score >= 75) return "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300";
  if (score >= 50) return "border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400";
  return "border-red-300 dark:border-red-800 text-red-700 dark:text-red-400";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


function isValidUrl(str: string) {
  try { new URL(str); return true; } catch { return false; }
}

export function HistoryTable({
  matches,
  resumes,
  jds = [],
  defaultTab = "job_fit",
}: {
  matches: MatchListItem[];
  resumes: ResumeOut[];
  jds?: JobDescriptionOut[];
  defaultTab?: Tab;
}) {
  const { removeMatch, refreshAll } = useDashboardData();

  // resume id -> metadata, for the preview (file type decides PDF vs download)
  const resumeMap = useMemo(() => {
    const map = new Map<string, ResumeOut>();
    for (const r of resumes) map.set(r.id, r);
    return map;
  }, [resumes]);

  // jd id -> record, for the job description preview
  const jdMap = useMemo(() => {
    const map = new Map<string, JobDescriptionOut>();
    for (const j of jds) map.set(j.id, j);
    return map;
  }, [jds]);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  const [viewJd, setViewJd] = useState<{ jd: JobDescription | null; jdUrl?: string } | null>(null);
  const [previewResume, setPreviewResume] = useState<PreviewTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MatchListItem | null>(null);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const jobFitMatches = matches.filter((m) => m.mode === "candidate");
  const screenerMatches = matches.filter((m) => m.mode === "recruiter");
  const tabMatches = activeTab === "job_fit" ? jobFitMatches : screenerMatches;

  const filtered = tabMatches
    .filter((m) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        m.resume_file_name?.toLowerCase().includes(q) ||
        m.jd_url?.toLowerCase().includes(q) ||
        m.company_name?.toLowerCase().includes(q) ||
        m.job_title?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "match_score") return (getScore(a) - getScore(b)) * mul;
      return (
        (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()) * mul
      );
    });

  async function handleDelete(match: MatchListItem) {
    setDeletingId(match.id);
    try {
      // Removes only this analysis; the resume and job description stay.
      await api.matches.remove(match.id);
      removeMatch(match.id);
      toast.success("Analysis deleted. Your resume and job description were kept.");
      refreshAll(); // counts and overview
    } catch (err) {
      toast.error(describeError(err, "Something went wrong. Please try again."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-1 rounded-lg border border-border p-1 bg-muted/30">
          <button
            onClick={() => { setActiveTab("job_fit"); setFilter(""); }}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "job_fit"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Target className="h-3.5 w-3.5" />
            Job Fit
            {jobFitMatches.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({jobFitMatches.length})
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab("screener"); setFilter(""); }}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "screener"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ScanSearch className="h-3.5 w-3.5" />
            Resume Screener
            {screenerMatches.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({screenerMatches.length})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by resume or job…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Search className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {filter
              ? "No matches found for your search."
              : activeTab === "job_fit"
                ? "No Job Fit analyses yet."
                : "No Resume Screener analyses yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resume</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 font-medium"
                    onClick={() => toggleSort("match_score")}
                  >
                    Score
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 font-medium"
                    onClick={() => toggleSort("created_at")}
                  >
                    Date
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </TableHead>
                <TableHead>Match Report</TableHead>
                <TableHead className="w-15" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((match) => {
                const isDeleting = deletingId === match.id;
                const score = getScore(match);
                const resume = resumeMap.get(match.resume_id);
                const jdRecord = match.jd_id ? jdMap.get(match.jd_id) : undefined;
                const fileName = match.resume_file_name ?? "Unknown";
                return (
                  <TableRow key={match.id} className={cn(isDeleting && "opacity-50")}>
                    <TableCell className="font-medium max-w-40">
                      {resume ? (
                        <button
                          onClick={() =>
                            setPreviewResume({
                              id: resume.id,
                              fileName: resume.file_name ?? fileName,
                              mimeType: resume.mime_type,
                            })
                          }
                          className="flex items-center gap-1.5 text-left group"
                          title="Preview resume"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                          <span className="block truncate text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 underline decoration-dotted underline-offset-2 transition-colors">
                            {fileName}
                          </span>
                        </button>
                      ) : (
                        <span className="block truncate text-sm">{fileName}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-50">
                      {jdRecord || match.jd_url ? (
                        <button
                          onClick={() => {
                            const rawUrl = match.jd_url ?? jdRecord?.jd_url ?? undefined;
                            setViewJd({
                              jd: jdRecord?.jd_object ?? null,
                              jdUrl: rawUrl && isValidUrl(rawUrl) ? rawUrl : undefined,
                            });
                          }}
                          className="group text-left min-w-0 w-full"
                          title="Preview job description"
                        >
                          {match.company_name || match.job_title ? (
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 underline decoration-dotted underline-offset-2 transition-colors">
                                {match.company_name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {match.job_title}
                              </span>
                            </div>
                          ) : (
                            <span className="block truncate text-xs text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 underline decoration-dotted underline-offset-2 transition-colors">
                              {match.jd_url}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold ${scoreBadgeClass(score)}`}
                      >
                        {score}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {match.created_at ? formatDate(match.created_at) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setViewMatchId(match.id)}
                      >
                        View Report
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-500"
                        onClick={() => setPendingDelete(match)}
                        disabled={isDeleting}
                        title="Delete"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Job Description Preview Dialog */}
      <Dialog open={!!viewJd} onOpenChange={(open) => !open && setViewJd(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {viewJd?.jd?.job_title ?? "Job Description"}
            </DialogTitle>
          </DialogHeader>
          {viewJd && (() => {
            const jd = viewJd.jd;
            return (
            <div className="space-y-5 pt-1">
              {/* Header info */}
              {(jd || viewJd.jdUrl) && (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  {jd?.job_title && (
                    <h2 className="text-lg font-semibold">{jd.job_title}</h2>
                  )}
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {jd?.company_name && (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> {jd.company_name}
                      </span>
                    )}
                    {jd?.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {jd.location}
                      </span>
                    )}
                    {jd?.employment_type && (
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" /> {jd.employment_type}
                      </span>
                    )}
                  </div>
                  {viewJd.jdUrl && (
                    <a
                      href={viewJd.jdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                    >
                      <ExternalLink className="h-3 w-3" /> {viewJd.jdUrl}
                    </a>
                  )}
                </div>
              )}

              {/* Description */}
              {jd?.description && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {jd.description}
                  </p>
                </div>
              )}

              {/* Responsibilities */}
              {jd?.responsibilities && jd.responsibilities.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Responsibilities</h3>
                  <ul className="space-y-1.5">
                    {jd.responsibilities.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Requirements */}
              {jd?.requirements && jd.requirements.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Requirements</h3>
                  <ul className="space-y-1.5">
                    {jd.requirements.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {jd?.benefits && jd.benefits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Benefits</h3>
                  <ul className="space-y-1.5">
                    {jd.benefits.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fallback: no structured data and no URL */}
              {!jd && !viewJd.jdUrl && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No job details available.
                </p>
              )}
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ResumePreviewDialog target={previewResume} onClose={() => setPreviewResume(null)} />

      <MatchDetailDialog matchId={viewMatchId} onClose={() => setViewMatchId(null)} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the match analysis
              {pendingDelete?.resume_file_name ? ` for "${pendingDelete.resume_file_name}"` : ""}.
              Your resume and job description are kept. The credit spent on this analysis
              isn&apos;t returned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) {
                  handleDelete(pendingDelete);
                  setPendingDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
