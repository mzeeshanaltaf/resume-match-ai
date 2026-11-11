"use client";

import { Check } from "lucide-react";
import { ScoreMark } from "@/components/proof";
import type {
  ImprovementSuggestion,
  JobDescription,
  MatchOut,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { SCORE_MARK_TONE, scoreBand } from "@/lib/score";
import { Detail, Entry, Fold, Marked, Paper, Section, noteFrom } from "./report-parts";

const HONEST_FOOTER =
  "A score is a model's reading of this resume against this posting. It is not an applicant-tracking result, and it cannot know what you left out of the page.";

/**
 * The analysis, laid out as the document it is about: paper, the grade written
 * in the corner, findings in the text and the editor's notes in the margin.
 * One component for the report page; Job Fit (candidate) and Screener
 * (recruiter) reports both come through here.
 */
export function MatchReport({
  match,
  jd,
}: {
  match: MatchOut;
  /** Extra posting fields (location), when the posting list has been loaded. */
  jd?: JobDescription | null;
}) {
  const report = match.report;
  const summary = report?.match_summary;
  const ats = report?.ats_optimization;
  const detailed = report?.detailed_analysis;
  const improvements = report?.improvement_suggestions;

  const score = Math.round(match.overall_score_percent ?? summary?.overall_score_percent ?? 0);
  const confidence = match.score_confidence ?? summary?.score_confidence ?? null;
  const band = scoreBand(score);

  const title = match.job_title ?? jd?.job_title ?? "Job posting";
  const meta = [match.company_name ?? jd?.company_name, jd?.location].filter(Boolean).join(", ");

  const strengths = summary?.key_strengths ?? [];
  const gaps = summary?.critical_gaps ?? [];
  const keywords = ats?.keywords_to_add ?? [];
  const rephrase = ats?.skills_to_rephrase ?? [];
  const sections = ats?.section_recommendations ?? [];
  const met = detailed?.requirements_met ?? [];
  const weak = detailed?.gaps_and_weak_matches ?? [];

  return (
    <Paper label={`Report for ${title}`}>
      {/* Header: what was read against what, and the grade */}
      <header className="grid gap-x-8 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-page-muted">
            {match.mode === "recruiter" ? "Screening report" : "Job fit report"}
          </p>
          <h2 className="mt-1 font-sans text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {title}
          </h2>
          {meta && <p className="mt-1 text-lg">{meta}</p>}
          <p className="mt-3 font-sans text-sm text-page-muted">
            Resume: <span className="font-semibold text-page-foreground">{match.resume_file_name ?? "Unknown"}</span>
            {match.created_at && <> · {formatDate(match.created_at)}</>}
          </p>
        </div>
        <div className="sm:text-right">
          <div className="inline-block pr-3 pt-2 text-[3.75rem] sm:text-[4.5rem]">
            <ScoreMark
              value={String(score)}
              suffix="%"
              tone={SCORE_MARK_TONE[band.tone]}
              surface="page"
              immediate
            />
          </div>
          <p className="font-sans text-sm font-semibold">
            {band.label}
            {confidence && (
              <span className="font-normal text-page-muted"> · {confidence.toLowerCase()} confidence</span>
            )}
          </p>
        </div>
      </header>

      {summary?.rationale && (
        <div className="mt-8 border-t border-page-rule pt-6">
          <h2 className="font-sans text-lg font-semibold">Why this score</h2>
          <p className="mt-2 max-w-[68ch]">{summary.rationale}</p>
        </div>
      )}

      {strengths.length > 0 && (
        <Section title="What already works" count={strengths.length}>
          {strengths.map((s, i) => (
            <Entry key={i}>
              <p className="flex items-start gap-2 font-semibold">
                <Check aria-hidden className="mt-[0.4em] size-4 shrink-0 text-page-proof" />
                <span>
                  <Marked kind="underline" tone="proof">{s.strength}</Marked>
                </span>
              </p>
              {s.evidence && <p>{s.evidence}</p>}
              {s.jd_alignment && <Detail label="Matches the posting:">{s.jd_alignment}</Detail>}
            </Entry>
          ))}
        </Section>
      )}

      {gaps.length > 0 && (
        <Section title="What to fix first" count={gaps.length}>
          {gaps.map((g, i) => (
            <Entry
              key={i}
              note={noteFrom(
                g.impact_level && `${g.impact_level} impact`,
                g.remediation_difficulty && `${g.remediation_difficulty} to fix`,
              )}
            >
              <p className="font-semibold">
                <Marked kind="underline" tone="pencil">{g.gap}</Marked>
              </p>
              {g.jd_requirement && <Detail label="The posting asks for:">{g.jd_requirement}</Detail>}
            </Entry>
          ))}
        </Section>
      )}

      {improvements && <Improvements improvements={improvements} />}

      {(keywords.length > 0 || rephrase.length > 0 || sections.length > 0) && (
        <Section title="Words and sections to change">
          {keywords.map((k, i) => (
            <Entry
              key={`k${i}`}
              note={noteFrom(k.frequency_recommendation && `use ${k.frequency_recommendation}`)}
              tone="pencil"
            >
              <p>
                <span className="font-sans text-sm font-semibold text-page-muted">Add </span>
                <span className="font-semibold">
                  <Marked kind="circle" tone="pencil">{k.keyword}</Marked>
                </span>
              </p>
              {k.context_suggestion && <p>{k.context_suggestion}</p>}
            </Entry>
          ))}
          {rephrase.map((r, i) => (
            <Entry key={`r${i}`}>
              <p>
                <span className="font-sans text-sm font-semibold text-page-muted">Cut </span>
                <Marked kind="strike" tone="pencil">{r.current_phrase}</Marked>
              </p>
              <p>
                <span className="font-sans text-sm font-semibold text-page-muted">Write </span>
                <span className="font-semibold text-page-proof">{r.suggested_rephrase}</span>
              </p>
              {r.reason && <Detail label="Why:">{r.reason}</Detail>}
            </Entry>
          ))}
          {sections.map((s, i) => (
            <Entry key={`s${i}`}>
              <p className="font-semibold">{s.section}</p>
              <p>{s.recommendation}</p>
              {s.rationale && <Detail label="Why:">{s.rationale}</Detail>}
            </Entry>
          ))}
        </Section>
      )}

      {(met.length > 0 || weak.length > 0) && (
        <Fold title="Requirement by requirement" count={met.length + weak.length}>
          {met.map((m, i) => (
            <Entry
              key={`m${i}`}
              tone="proof"
              note={noteFrom(m.match_quality && `${m.match_quality} match`)}
            >
              <p className="font-semibold">{m.jd_requirement}</p>
              <Detail label="In your resume:">{m.resume_evidence}</Detail>
              {m.notes && <Detail label="Note:">{m.notes}</Detail>}
            </Entry>
          ))}
          {weak.map((w, i) => (
            <Entry
              key={`w${i}`}
              tone="pencil"
              note={noteFrom(w.impact_level && `${w.impact_level} impact`, w.requirement_type)}
            >
              <p className="font-semibold">{w.jd_requirement}</p>
              <Detail label="In your resume:">{w.current_status}</Detail>
              {w.suggested_action && <Detail label="Do this:">{w.suggested_action}</Detail>}
            </Entry>
          ))}
        </Fold>
      )}

      <footer className="mt-10 border-t border-page-rule pt-5 font-sans text-sm text-page-muted">
        <p className="max-w-[68ch]">{HONEST_FOOTER}</p>
      </footer>
    </Paper>
  );
}

function Improvements({
  improvements,
}: {
  improvements: NonNullable<MatchOut["report"]["improvement_suggestions"]>;
}) {
  const high = improvements.high_priority ?? [];
  const medium = improvements.medium_priority ?? [];
  const nice = improvements.nice_to_have ?? [];

  const render = (items: ImprovementSuggestion[], tone: "pencil" | "ink") =>
    items.map((item, i) => (
      <Entry
        key={i}
        tone={tone}
        note={noteFrom(item.effort_required && `${item.effort_required} effort`)}
      >
        <p>{item.suggestion}</p>
        {item.expected_impact && <Detail label="Expected result:">{item.expected_impact}</Detail>}
        {item.example_phrasing && (
          <p className="text-[1rem] italic">
            <span className="font-sans text-sm font-semibold not-italic text-page-muted">
              Try:{" "}
            </span>
            &ldquo;{item.example_phrasing}&rdquo;
          </p>
        )}
      </Entry>
    ));

  return (
    <>
      {high.length > 0 && (
        <Section title="Changes that matter most" count={high.length}>
          {render(high, "pencil")}
        </Section>
      )}
      {medium.length > 0 && (
        <Section title="Worth doing next" count={medium.length}>
          {render(medium, "ink")}
        </Section>
      )}
      {nice.length > 0 && (
        <Fold title="If you have time" count={nice.length}>
          {render(nice, "ink")}
        </Fold>
      )}
    </>
  );
}
