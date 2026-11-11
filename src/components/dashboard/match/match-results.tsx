"use client";

import { ScoreRing } from "./score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  TrendingUp,
  Search,
  ArrowRightLeft,
  FileText,
  Lightbulb,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MatchOut } from "@/lib/api/types";
import Link from "next/link";

interface MatchResultsProps {
  result: MatchOut;
  onReset: () => void;
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

export function MatchResults({ result, onReset }: MatchResultsProps) {
  const ms = result.report?.match_summary;
  const ats = result.report?.ats_optimization;
  const detailed = result.report?.detailed_analysis;
  const improvements = result.report?.improvement_suggestions;

  const score = ms?.overall_score_percent ?? 0;
  const confidence = ms?.score_confidence ?? "unknown";

  return (
    <div className="space-y-6">
      {/* Score + Confidence */}
      <div className="flex flex-col items-center gap-2 py-4">
        <ScoreRing score={score} />
        <Badge variant="outline" className={cn("text-xs font-medium capitalize", confidenceBadge(confidence))}>
          {confidence} confidence
        </Badge>
      </div>

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
            {/* Keywords to add */}
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

            {/* Skills to rephrase */}
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
                      <p className="mt-1 text-[10px] text-muted-foreground">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section recommendations */}
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
                      <p className="mt-0.5 text-[10px] italic text-muted-foreground/70">{sr.rationale}</p>
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
            {/* High Priority */}
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

            {/* Medium Priority */}
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

            {/* Nice to Have */}
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
            {/* Requirements met */}
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

            {/* Gaps & weak matches */}
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

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onReset}
        >
          <RotateCcw className="h-4 w-4" />
          New analysis
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/history">View history</Link>
        </Button>
      </div>
    </div>
  );
}

function SuggestionCard({
  item,
}: {
  item: { suggestion: string; effort_required: string; expected_impact: string; example_phrasing?: string | null };
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
