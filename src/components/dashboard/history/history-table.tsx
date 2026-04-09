"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
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
import { cn } from "@/lib/utils";
import type { JobMatchSummary, ResumeRecord, JobDescription } from "@/types/n8n";

const PdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

type Tab = "job_fit" | "screener";
type SortField = "match_score" | "updated_at";
type SortDir = "asc" | "desc";

function getScore(match: JobMatchSummary): number {
  return match.job_match_summary?.match_summary?.overall_score_percent ?? 0;
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


export function HistoryTable({ initialMatches, resumes, defaultTab = "job_fit" }: { initialMatches: JobMatchSummary[]; resumes: ResumeRecord[]; defaultTab?: Tab }) {
  const [matches, setMatches] = useState<JobMatchSummary[]>(initialMatches);
  useEffect(() => { setMatches(initialMatches); }, [initialMatches]);

  // Build file_id → base64 lookup for PDF preview
  const base64Map = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of resumes) {
      if (r.file_id && r.file_base64) map.set(r.file_id, r.file_base64);
    }
    return map;
  }, [resumes]);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMatch, setViewMatch] = useState<JobMatchSummary | null>(null);
  const [viewJd, setViewJd] = useState<{ jd: JobDescription; jdUrl?: string } | null>(null);
  const [previewResume, setPreviewResume] = useState<{ base64: string; fileName: string } | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JobMatchSummary | null>(null);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const jobFitMatches = matches.filter((m) => m.is_candidate === true);
  const screenerMatches = matches.filter((m) => m.is_candidate === false);
  const tabMatches = activeTab === "job_fit" ? jobFitMatches : screenerMatches;

  const filtered = tabMatches
    .filter((m) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        m.file_name?.toLowerCase().includes(q) ||
        m.jd_url?.toLowerCase().includes(q) ||
        m.file_id?.toLowerCase().includes(q) ||
        m.job_description?.company_name?.toLowerCase().includes(q) ||
        m.job_description?.job_title?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "match_score") return (getScore(a) - getScore(b)) * mul;
      return (
        (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * mul
      );
    });

  async function handleDelete(match: JobMatchSummary) {
    const key = `${match.file_id ?? match.file_name}_${match.url_id ?? match.jd_url}`;
    setDeletingKey(key);
    try {
      const id = match.file_id ?? match.summary_id ?? "";
      const res = await fetch(`/api/match/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url_id: match.url_id }),
      });
      if (!res.ok) throw new Error();
      setMatches((prev) =>
        prev.filter((m) => {
          if (match.file_id && match.url_id) {
            return !(m.file_id === match.file_id && m.url_id === match.url_id);
          }
          return !(m.file_name === match.file_name && m.jd_url === match.jd_url);
        })
      );
      toast.success("Match deleted successfully.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDeletingKey(null);
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
                    onClick={() => toggleSort("updated_at")}
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
              {filtered.map((match, i) => {
                const key = `${match.file_id ?? match.file_name ?? i}_${match.url_id ?? match.jd_url ?? i}`;
                const isDeleting = deletingKey === key;
                const score = getScore(match);
                return (
                  <TableRow key={`${key}_${i}`} className={cn(isDeleting && "opacity-50")}>
                    <TableCell className="font-medium max-w-40">
                      {base64Map.has(match.file_id) ? (
                        <button
                          onClick={() =>
                            setPreviewResume({
                              base64: base64Map.get(match.file_id)!,
                              fileName: match.file_name ?? "resume.pdf",
                            })
                          }
                          className="flex items-center gap-1.5 text-left group"
                          title="Preview PDF"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                          <span className="block truncate text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 underline decoration-dotted underline-offset-2 transition-colors">
                            {match.file_name ?? match.file_id ?? "Unknown"}
                          </span>
                        </button>
                      ) : (
                        <span className="block truncate text-sm">
                          {match.file_name ?? match.file_id ?? "Unknown"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-50">
                      {match.job_description || match.jd_url ? (
                        <button
                          onClick={() => setViewJd({ jd: match.job_description!, jdUrl: match.jd_url })}
                          className="group text-left min-w-0 w-full"
                          title="Preview job description"
                        >
                          {match.job_description?.company_name || match.job_description?.job_title ? (
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 underline decoration-dotted underline-offset-2 transition-colors">
                                {match.job_description.company_name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {match.job_description.job_title}
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
                      {match.updated_at ? formatDate(match.updated_at) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setViewMatch(match)}
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
              Job Description
            </DialogTitle>
          </DialogHeader>
          {viewJd && (
            <div className="space-y-5 pt-1">
              {/* Header info */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                {viewJd.jd?.job_title && (
                  <h2 className="text-lg font-semibold">{viewJd.jd.job_title}</h2>
                )}
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {viewJd.jd?.company_name && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> {viewJd.jd.company_name}
                    </span>
                  )}
                  {viewJd.jd?.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {viewJd.jd.location}
                    </span>
                  )}
                  {viewJd.jd?.employment_type && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" /> {viewJd.jd.employment_type}
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

              {/* Description */}
              {viewJd.jd?.description && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {viewJd.jd.description}
                  </p>
                </div>
              )}

              {/* Responsibilities */}
              {viewJd.jd?.responsibilities?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Responsibilities</h3>
                  <ul className="space-y-1.5">
                    {viewJd.jd.responsibilities.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Requirements */}
              {viewJd.jd?.requirements?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Requirements</h3>
                  <ul className="space-y-1.5">
                    {viewJd.jd.requirements.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {viewJd.jd?.benefits?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Benefits</h3>
                  <ul className="space-y-1.5">
                    {viewJd.jd.benefits.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fallback: jd_url only, no structured data */}
              {!viewJd.jd && viewJd.jdUrl && (
                <div className="rounded-lg border border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No parsed job details available.</p>
                  <a
                    href={viewJd.jdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" /> Open job posting
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={!!previewResume} onOpenChange={(open) => !open && setPreviewResume(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold truncate">
              {previewResume?.fileName ?? "Resume Preview"}
            </DialogTitle>
          </DialogHeader>
          {previewResume && (
            <PdfViewer base64={previewResume.base64} fileName={previewResume.fileName} />
          )}
        </DialogContent>
      </Dialog>

      <MatchDetailDialog
        match={viewMatch}
        onClose={() => setViewMatch(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the match analysis
              {pendingDelete?.file_name ? ` for "${pendingDelete.file_name}"` : ""}.
              This action cannot be undone.
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
