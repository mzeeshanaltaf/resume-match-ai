"use client";

import { useState, useEffect } from "react";
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
  ArrowUpDown,
  Eye,
  Trash2,
  Search,
  Loader2,
  Target,
  ScanSearch,
} from "lucide-react";
import { toast } from "sonner";
import { MatchDetailDialog } from "./match-detail-dialog";
import { cn } from "@/lib/utils";
import type { JobMatchSummary } from "@/types/n8n";

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

export function HistoryTable({ initialMatches }: { initialMatches: JobMatchSummary[] }) {
  const [matches, setMatches] = useState<JobMatchSummary[]>(initialMatches);
  useEffect(() => { setMatches(initialMatches); }, [initialMatches]);
  const [activeTab, setActiveTab] = useState<Tab>("job_fit");
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMatch, setViewMatch] = useState<JobMatchSummary | null>(null);
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
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((match, i) => {
                const key = `${match.file_id ?? match.file_name ?? i}_${match.url_id ?? match.jd_url ?? i}`;
                const isDeleting = deletingKey === key;
                const score = getScore(match);
                return (
                  <TableRow key={`${key}_${i}`} className={cn(isDeleting && "opacity-50")}>
                    <TableCell className="font-medium max-w-[160px]">
                      <span className="block truncate text-sm">
                        {match.file_name ?? match.file_id ?? "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {match.jd_url && match.jd_url.trim() !== "" ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {match.jd_url}
                        </span>
                      ) : match.job_description?.company_name || match.job_description?.job_title ? (
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-medium">
                            {match.job_description.company_name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {match.job_description.job_title}
                          </span>
                        </div>
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewMatch(match)}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
              className="bg-destructive text-white hover:bg-destructive/90"
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
