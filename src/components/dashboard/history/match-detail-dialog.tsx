"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Search,
  ArrowRightLeft,
  FileText,
  ChevronDown,
  ChevronUp,
  Building2,
  MapPin,
  Printer,
} from "lucide-react";
import { ScoreRing } from "@/components/dashboard/match/score-ring";
import { cn } from "@/lib/utils";
import type { JobMatchSummary } from "@/types/n8n";

interface MatchDetailDialogProps {
  match: JobMatchSummary | null;
  onClose: () => void;
}

function impactColor(level: string) {
  switch (level.toLowerCase()) {
    case "high":
      return "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400";
    case "medium":
      return "border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function effortBadge(effort: string) {
  switch (effort.toLowerCase()) {
    case "high":
    case "hard":
      return "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400";
    case "medium":
      return "border-yellow-300 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400";
    default:
      return "border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400";
  }
}

function confidenceBadge(confidence: string) {
  switch (confidence.toLowerCase()) {
    case "high":
      return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300";
    case "medium":
      return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
    default:
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
  }
}

function CollapsibleSection({
  title,
  icon: Icon,
  iconClass,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconClass)} />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

export function MatchDetailDialog({ match, onClose }: MatchDetailDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!match) return null;

  const ms = match.job_match_summary?.match_summary;
  const ats = match.job_match_summary?.ats_optimization;
  const detailed = match.job_match_summary?.detailed_analysis;
  const improvements = match.job_match_summary?.improvement_suggestions;
  const jd = match.job_description;
  const score = ms?.overall_score_percent ?? 0;
  const confidence = ms?.score_confidence ?? "unknown";

  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Match Report - ${match!.file_name ?? match!.file_id ?? "Report"}</title>
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h3 { font-size: 14px; margin-bottom: 8px; }
        h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 6px; }
        p { margin-bottom: 4px; }
        .badge { display: inline-block; border: 1px solid #ddd; border-radius: 9999px; padding: 1px 8px; font-size: 10px; font-weight: 600; }
        .section { border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
        .card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
        .text-muted { color: #666; }
        .text-sm { font-size: 12px; }
        .text-xs { font-size: 11px; }
        .green { color: #059669; }
        .red { color: #dc2626; }
        .score-header { text-align: center; margin: 16px 0; }
        .score-value { font-size: 36px; font-weight: 700; }
        .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
        @media print { body { padding: 0; } }
      </style></head><body>
    `);
    printWindow.document.write(`<h1>Match Report</h1>`);
    printWindow.document.write(`<p class="meta">${match!.file_name ?? match!.file_id ?? "Unknown"}</p>`);

    // Job info
    if (jd && (jd.company_name || jd.job_title)) {
      printWindow.document.write(`<div class="section"><strong>${jd.company_name ?? ""}</strong>`);
      if (jd.job_title) printWindow.document.write(`<br/><span class="text-muted">${jd.job_title}</span>`);
      if (jd.location) printWindow.document.write(`<br/><span class="text-muted">${jd.location}</span>`);
      printWindow.document.write(`</div>`);
    }

    // Score
    printWindow.document.write(`<div class="score-header"><div class="score-value">${score}%</div><span class="badge">${confidence} confidence</span></div>`);

    // Rationale
    if (ms?.rationale) {
      printWindow.document.write(`<div class="section"><h3>Rationale</h3><p class="text-muted">${ms.rationale}</p></div>`);
    }

    // Key Strengths
    if (ms?.key_strengths?.length) {
      printWindow.document.write(`<div class="section"><h3>Key Strengths</h3>`);
      for (const s of ms.key_strengths) {
        printWindow.document.write(`<div class="card"><p><strong>${s.strength}</strong></p><p class="text-xs text-muted">${s.evidence}</p>`);
        if (s.jd_alignment) printWindow.document.write(`<p class="text-xs green">${s.jd_alignment}</p>`);
        printWindow.document.write(`</div>`);
      }
      printWindow.document.write(`</div>`);
    }

    // Critical Gaps
    if (ms?.critical_gaps?.length) {
      printWindow.document.write(`<div class="section"><h3>Critical Gaps (${ms.critical_gaps.length})</h3>`);
      for (const g of ms.critical_gaps) {
        printWindow.document.write(`<div class="card"><p>${g.gap}</p><p class="text-xs"><span class="badge">${g.impact_level} impact</span> <span class="badge">${g.remediation_difficulty} to fix</span></p>`);
        if (g.jd_requirement) printWindow.document.write(`<p class="text-xs text-muted">Requirement: ${g.jd_requirement}</p>`);
        printWindow.document.write(`</div>`);
      }
      printWindow.document.write(`</div>`);
    }

    // ATS
    if (ats) {
      printWindow.document.write(`<div class="section"><h3>ATS Optimization</h3>`);
      if (ats.keywords_to_add?.length) {
        printWindow.document.write(`<h4>Keywords to Add</h4>`);
        for (const kw of ats.keywords_to_add) {
          printWindow.document.write(`<div class="card"><strong>${kw.keyword}</strong> — <span class="text-muted">${kw.context_suggestion}</span></div>`);
        }
      }
      if (ats.skills_to_rephrase?.length) {
        printWindow.document.write(`<h4>Skills to Rephrase</h4>`);
        for (const s of ats.skills_to_rephrase) {
          printWindow.document.write(`<div class="card"><s class="text-muted">${s.current_phrase}</s> → <strong class="green">${s.suggested_rephrase}</strong>`);
          if (s.reason) printWindow.document.write(`<br/><span class="text-xs text-muted">${s.reason}</span>`);
          printWindow.document.write(`</div>`);
        }
      }
      if (ats.section_recommendations?.length) {
        printWindow.document.write(`<h4>Section Recommendations</h4>`);
        for (const sr of ats.section_recommendations) {
          printWindow.document.write(`<div class="card"><strong>${sr.section}</strong><br/><span class="text-muted">${sr.recommendation}</span></div>`);
        }
      }
      printWindow.document.write(`</div>`);
    }

    // Improvement Suggestions
    if (improvements) {
      printWindow.document.write(`<div class="section"><h3>Improvement Suggestions</h3>`);
      const groups = [
        { label: "High Priority", items: improvements.high_priority },
        { label: "Medium Priority", items: improvements.medium_priority },
        { label: "Nice to Have", items: improvements.nice_to_have },
      ];
      for (const g of groups) {
        if (g.items?.length) {
          printWindow.document.write(`<h4>${g.label}</h4>`);
          for (const item of g.items) {
            printWindow.document.write(`<div class="card"><p>${item.suggestion}</p><p class="text-xs"><span class="badge">${item.effort_required} effort</span> <span class="badge">${item.expected_impact}</span></p>`);
            if (item.example_phrasing) printWindow.document.write(`<p class="text-xs text-muted" style="font-style:italic">"${item.example_phrasing}"</p>`);
            printWindow.document.write(`</div>`);
          }
        }
      }
      printWindow.document.write(`</div>`);
    }

    // Detailed Analysis
    if (detailed) {
      printWindow.document.write(`<div class="section"><h3>Detailed Analysis</h3>`);
      if (detailed.requirements_met?.length) {
        printWindow.document.write(`<h4>Requirements Matched</h4>`);
        for (const rm of detailed.requirements_met) {
          printWindow.document.write(`<div class="card"><p class="text-muted">${rm.jd_requirement}</p><p class="text-xs">Evidence: ${rm.resume_evidence}</p><p class="text-xs"><span class="badge">${rm.match_quality} match</span> <span class="badge">${rm.requirement_type}</span></p></div>`);
        }
      }
      if (detailed.gaps_and_weak_matches?.length) {
        printWindow.document.write(`<h4>Gaps & Weak Matches</h4>`);
        for (const gm of detailed.gaps_and_weak_matches) {
          printWindow.document.write(`<div class="card"><p class="text-muted">${gm.jd_requirement}</p><p class="text-xs">Status: ${gm.current_status}</p><p class="text-xs"><span class="badge">${gm.impact_level} impact</span> <span class="badge">${gm.requirement_type}</span></p>`);
          if (gm.suggested_action) printWindow.document.write(`<p class="text-xs green">Action: ${gm.suggested_action}</p>`);
          printWindow.document.write(`</div>`);
        }
      }
      printWindow.document.write(`</div>`);
    }

    printWindow.document.write(`</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <Dialog open={!!match} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Match Report
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mr-6"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {match.file_name ?? match.file_id ?? "Unknown"}
          </p>
        </DialogHeader>

        <div ref={printRef} className="space-y-5 pt-2">
          {/* Job info */}
          {jd && (jd.company_name || jd.job_title) && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                {jd.company_name && (
                  <p className="text-sm font-medium">{jd.company_name}</p>
                )}
                {jd.job_title && (
                  <p className="text-xs text-muted-foreground">{jd.job_title}</p>
                )}
                {jd.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {jd.location}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Score + Confidence */}
          <div className="flex flex-col items-center gap-2 py-2">
            <ScoreRing score={score} />
            <Badge
              variant="outline"
              className={cn("text-xs font-medium capitalize", confidenceBadge(confidence))}
            >
              {confidence} confidence
            </Badge>
          </div>

          {/* Rationale */}
          {ms?.rationale && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="mb-2 text-sm font-semibold">Rationale</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {ms.rationale}
              </p>
            </div>
          )}

          {/* Key Strengths */}
          {ms?.key_strengths && ms.key_strengths.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Key Strengths</h3>
              </div>
              <div className="space-y-3">
                {ms.key_strengths.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-sm font-medium">{s.strength}</p>
                    <p className="text-xs text-muted-foreground">{s.evidence}</p>
                    {s.jd_alignment && (
                      <p className="text-xs italic text-emerald-600 dark:text-emerald-400">
                        {s.jd_alignment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical Gaps */}
          {ms?.critical_gaps && ms.critical_gaps.length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold">
                  Critical Gaps
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({ms.critical_gaps.length})
                  </span>
                </h3>
              </div>
              <div className="space-y-3">
                {ms.critical_gaps.map((g, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="text-sm">{g.gap}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={cn("text-[10px]", impactColor(g.impact_level))}>
                        {g.impact_level} impact
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px]", effortBadge(g.remediation_difficulty))}>
                        {g.remediation_difficulty} to fix
                      </Badge>
                    </div>
                    {g.jd_requirement && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Requirement:</span> {g.jd_requirement}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ATS Optimization */}
          {ats && (
            <CollapsibleSection
              title="ATS Optimization"
              icon={Search}
              iconClass="text-blue-500"
              defaultOpen
            >
              <div className="space-y-5">
                {ats.keywords_to_add?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Keywords to Add
                    </h4>
                    <div className="space-y-2">
                      {ats.keywords_to_add.map((kw, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-md border border-border p-3">
                          <Badge variant="outline" className="shrink-0 text-xs font-bold">
                            {kw.keyword}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{kw.context_suggestion}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                              Use {kw.frequency_recommendation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ats.skills_to_rephrase?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Skills to Rephrase
                    </h4>
                    <div className="space-y-2">
                      {ats.skills_to_rephrase.map((s, i) => (
                        <div key={i} className="rounded-md border border-border p-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="line-through text-muted-foreground">{s.current_phrase}</span>
                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {s.suggested_rephrase}
                            </span>
                          </div>
                          {s.reason && (
                            <p className="mt-1 text-[10px] text-muted-foreground">{s.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ats.section_recommendations?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Section Recommendations
                    </h4>
                    <div className="space-y-2">
                      {ats.section_recommendations.map((sr, i) => (
                        <div key={i} className="rounded-md border border-border p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-semibold">{sr.section}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{sr.recommendation}</p>
                          {sr.rationale && (
                            <p className="mt-0.5 text-[10px] italic text-muted-foreground/70">{sr.rationale}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Improvement Suggestions */}
          {improvements && (
            <CollapsibleSection
              title="Improvement Suggestions"
              icon={Lightbulb}
              iconClass="text-amber-500"
            >
              <div className="space-y-5">
                {improvements.high_priority?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-500">
                      High Priority
                    </h4>
                    <div className="space-y-2">
                      {improvements.high_priority.map((item, i) => (
                        <SuggestionCard key={i} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {improvements.medium_priority?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-yellow-500">
                      Medium Priority
                    </h4>
                    <div className="space-y-2">
                      {improvements.medium_priority.map((item, i) => (
                        <SuggestionCard key={i} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {improvements.nice_to_have?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Nice to Have
                    </h4>
                    <div className="space-y-2">
                      {improvements.nice_to_have.map((item, i) => (
                        <SuggestionCard key={i} item={item} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Detailed Analysis */}
          {detailed && (
            <CollapsibleSection
              title="Detailed Analysis"
              icon={FileText}
              iconClass="text-muted-foreground"
            >
              <div className="space-y-5">
                {detailed.requirements_met?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Requirements Matched
                    </h4>
                    <div className="space-y-2">
                      {detailed.requirements_met.map((rm, i) => (
                        <div key={i} className="rounded-md border border-border p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">{rm.jd_requirement}</p>
                          <p className="text-xs">
                            <span className="font-medium">Evidence:</span>{" "}
                            <span className="text-muted-foreground">{rm.resume_evidence}</span>
                          </p>
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {rm.match_quality} match
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {rm.requirement_type}
                            </Badge>
                          </div>
                          {rm.notes && (
                            <p className="text-[10px] italic text-muted-foreground/70">{rm.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailed.gaps_and_weak_matches?.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Gaps & Weak Matches
                    </h4>
                    <div className="space-y-2">
                      {detailed.gaps_and_weak_matches.map((gm, i) => (
                        <div key={i} className="rounded-md border border-border p-3 space-y-1">
                          <p className="text-xs text-muted-foreground">{gm.jd_requirement}</p>
                          <p className="text-xs">
                            <span className="font-medium">Status:</span>{" "}
                            <span className="text-muted-foreground">{gm.current_status}</span>
                          </p>
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className={cn("text-[10px]", impactColor(gm.impact_level))}>
                              {gm.impact_level} impact
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {gm.requirement_type}
                            </Badge>
                          </div>
                          {gm.suggested_action && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              <span className="font-medium">Action:</span> {gm.suggested_action}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionCard({
  item,
}: {
  item: { suggestion: string; effort_required: string; expected_impact: string; example_phrasing: string };
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <p className="text-xs">{item.suggestion}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className={cn("text-[10px]", effortBadge(item.effort_required))}>
          {item.effort_required} effort
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {item.expected_impact}
        </Badge>
      </div>
      {item.example_phrasing && (
        <p className="text-[10px] italic text-muted-foreground rounded bg-muted/50 px-2 py-1">
          &ldquo;{item.example_phrasing}&rdquo;
        </p>
      )}
    </div>
  );
}
