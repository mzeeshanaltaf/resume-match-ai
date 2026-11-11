import { Fragment } from "react";

/**
 * One sample report, cut into the six parts a real report has, each with a
 * plain note on how to read it. On large screens the report is a single sheet
 * and the notes sit beside the part they explain; on small screens each note
 * falls under its part inside the sheet.
 */

const Gap = ({ children }: { children: React.ReactNode }) => (
  <span className="font-sans font-semibold text-page-pencil">{children}</span>
);
const Strength = ({ children }: { children: React.ReactNode }) => (
  <span className="font-sans font-semibold text-page-proof">{children}</span>
);

const parts: {
  title: string;
  note: string;
  body: React.ReactNode;
}[] = [
  {
    title: "The score and how sure the model is",
    note: "Confidence is about the inputs. Medium or low usually means the posting or the resume left something out, not that you did badly.",
    body: (
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-[2.75rem] font-bold leading-none tracking-tight">78%</p>
        <div>
          <p className="font-semibold">Senior Product Analyst, Northfield Labs</p>
          <p className="text-page-muted">Confidence: medium. The posting is short on detail about the stack.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Strengths, with the evidence",
    note: "Each strength quotes your resume and the line of the posting it answers, so you can check the reading instead of trusting it.",
    body: (
      <div>
        <p>
          <Strength>Strength</Strength> Runs experiments end to end.
        </p>
        <p className="mt-1 text-page-muted">
          Resume: &ldquo;Designed and read out A/B tests on onboarding.&rdquo;
          Posting: &ldquo;Own our experimentation roadmap.&rdquo;
        </p>
      </div>
    ),
  },
  {
    title: "Gaps, with impact and effort",
    note: "A gap is something the posting asks for that the resume never shows. Impact says how much it matters, effort says how quickly you can fix it. Fix means adding something true, never inventing it.",
    body: (
      <div>
        <p>
          <Gap>Gap</Gap> SQL is not mentioned anywhere.
        </p>
        <p className="mt-1 text-page-muted">
          Posting: &ldquo;Daily SQL against the warehouse.&rdquo; Impact: high.
          Effort to fix: low, if you have used it.
        </p>
      </div>
    ),
  },
  {
    title: "Every requirement, met or not",
    note: "The full list from the posting, each paired with the resume line that answers it, or a note that nothing does. This is where to look when you disagree with the score.",
    body: (
      <ul className="divide-y divide-page-rule">
        {[
          ["5+ years in analytics", "4 years listed", "Partial"],
          ["Experimentation", "A/B tests on onboarding", "Strong"],
          ["SQL", "Not found", "Missing"],
        ].map(([req, evidence, quality]) => (
          <li key={req} className="flex flex-wrap justify-between gap-x-4 py-1.5 first:pt-0 last:pb-0">
            <span className="font-semibold">{req}</span>
            <span className="text-page-muted">
              {evidence} ·{" "}
              <span
                className={
                  quality === "Strong"
                    ? "font-sans font-semibold text-page-proof"
                    : quality === "Missing"
                      ? "font-sans font-semibold text-page-pencil"
                      : "font-sans font-semibold text-page-foreground"
                }
              >
                {quality}
              </span>
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "Changes, ranked",
    note: "Sorted by effort and expected impact, with example wording you can adapt. Reworded bullets and a cover letter draft can be generated from the same analysis.",
    body: (
      <div>
        <p className="font-semibold">High priority</p>
        <p className="mt-1">
          Replace &ldquo;Responsible for various reporting tasks&rdquo; with what
          the reports changed.
        </p>
        <p className="mt-1 text-page-muted">
          Example: &ldquo;Built the weekly Looker report three squads use to plan sprints.&rdquo;
        </p>
      </div>
    ),
  },
  {
    title: "Words the posting uses that you do not",
    note: "Applicant tracking systems and recruiters scan for the posting's own vocabulary. Use these only where they are true.",
    body: (
      <p>
        Add where true: <span className="font-semibold">SQL</span>,{" "}
        <span className="font-semibold">stakeholder reporting</span>,{" "}
        <span className="font-semibold">experimentation roadmap</span>.
      </p>
    ),
  },
];

export function ReportAnatomy() {
  return (
    <section id="report" className="px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-[24ch] text-[clamp(1.875rem,1.3rem+2.2vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
          What is in a report, and how to read it.
        </h2>
        <p className="mt-4 max-w-[38rem] text-[1.0625rem] leading-relaxed text-muted-foreground">
          This is a sample report for a sample resume and posting, in six
          parts. Every score arrives with its reasons attached.
        </p>

        <div className="relative mt-12 grid gap-x-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* The sheet: one continuous page behind the left column */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-page bg-page shadow-sheet lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[calc((100%-3rem)*1.35/2.35)]"
          />

          {parts.map((part, i) => (
            <Fragment key={part.title}>
              <div className="relative z-10 px-5 pb-5 pt-5 font-serif text-[0.9375rem] leading-relaxed text-page-foreground sm:px-8 lg:pb-6">
                <div className="mb-2 flex items-baseline gap-3">
                  <span
                    aria-hidden
                    className="font-hand text-[1.75rem] leading-none text-page-pencil"
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-sans text-base font-semibold">{part.title}</h3>
                </div>
                <div className="lg:pl-7">{part.body}</div>
                {/* Small screens: the note sits under its part, inside the sheet */}
                <p className="mt-3 border-t border-dashed border-page-rule pt-3 font-sans text-sm text-page-muted lg:hidden">
                  {part.note}
                </p>
                {i < parts.length - 1 && (
                  <div aria-hidden className="absolute inset-x-5 bottom-0 border-b border-page-rule sm:inset-x-8" />
                )}
              </div>
              <div className="hidden items-start gap-3 pt-6 lg:flex">
                <span
                  aria-hidden
                  className="font-hand text-[1.75rem] leading-none text-pencil"
                >
                  {i + 1}
                </span>
                <p className="max-w-[28ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {part.note}
                </p>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
