import { CtaButton } from "@/components/marketing/cta-button";
import { MarginNote, Strike, Underlined } from "@/components/proof";

const ranked = [
  {
    file: "okafor_maya.pdf",
    score: "87",
    reason: "Names SQL and owns experiments. Four years against a posting that asks for five.",
  },
  {
    file: "lindqvist_resume.docx",
    score: "74",
    reason: "Strong analytics work, no experimentation shown.",
  },
  {
    file: "haddad_cv.pdf",
    score: "61",
    reason: "Dashboards and reporting only. No testing, no SQL.",
  },
  {
    file: "park_j.pdf",
    score: "38",
    reason: "Marketing background. Little data work on the page.",
  },
];

export function Desks() {
  return (
    <section id="desks" className="border-y border-border bg-secondary">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <h2 className="max-w-[22ch] text-[clamp(1.875rem,1.3rem+2.2vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
          One desk for the person applying. One for the person reading.
        </h2>

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-14 lg:mt-16 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-border">
          {/* Candidate desk */}
          <div className="lg:pr-14">
            <h3 className="text-xl font-semibold">If you are applying</h3>
            <p className="mt-3 max-w-[34rem] leading-relaxed text-muted-foreground">
              Add one resume and one posting. You get the score, the
              requirements you meet and the ones you do not, reworded lines
              for your resume, and a cover letter draft.
            </p>

            <div className="mt-8 max-w-[34rem] rounded-page bg-page px-6 py-6 font-serif text-[0.9375rem] leading-[1.65] text-page-foreground shadow-sheet">
              <p className="text-page-muted">Experience, Brightpath</p>
              <p className="mt-2">
                <Strike surface="page" delay={0.1}>
                  Responsible for weekly reporting
                </Strike>
              </p>
              <p className="mt-3">
                <Underlined tone="proof" surface="page" delay={0.8} wrap>
                  Built the weekly Looker report three squads use to plan sprints
                </Underlined>
              </p>
              <p className="mt-5 text-[1.5rem] leading-none">
                <MarginNote
                  tone="proof"
                  surface="page"
                  arrow={false}
                  tilt={-1}
                  delay={1.4}
                  duration={0.9}
                >
                  say what it changed, then send it
                </MarginNote>
              </p>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              A sample rewrite. Suggestions only use what your resume already says.
            </p>

            <div className="mt-8">
              <CtaButton signedOutLabel="Mark up my resume" size="lg" withArrow />
            </div>
          </div>

          {/* Recruiter desk */}
          <div className="lg:pl-14">
            <h3 className="text-xl font-semibold">If you are reading a stack</h3>
            <p className="mt-3 max-w-[34rem] leading-relaxed text-muted-foreground">
              Add one posting and up to 20 resumes. Each is scored against it,
              then the pile is ranked, with a short reason for each place that
              you can check against the resume. If a resume cannot be read,
              its credit is refunded.
            </p>

            <ol className="mt-8 max-w-[34rem] space-y-[-0.35rem]" aria-label="Sample ranking">
              {ranked.map((r, i) => (
                <li
                  key={r.file}
                  className="relative flex items-start gap-4 rounded-page bg-page px-5 py-4 text-page-foreground shadow-sheet"
                  style={{
                    rotate: `${[-0.6, 0.5, -0.3, 0.7][i]}deg`,
                    marginLeft: `${[0, 0.9, 0.3, 1.2][i]}rem`,
                  }}
                >
                  <span className="w-14 shrink-0 text-center text-[2rem] leading-none">
                    <MarginNote
                      arrow={false}
                      tilt={-3}
                      tone={i === 0 ? "proof" : i === 3 ? "pencil" : "ink"}
                      delay={0.2 + i * 0.35}
                      duration={0.6}
                    >
                      {i + 1}
                      <span className="text-[0.55em] opacity-80"> · </span>
                      {r.score}
                    </MarginNote>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-sm font-semibold">
                      {r.file}
                    </span>
                    <span className="mt-0.5 block font-serif text-[0.9375rem] leading-snug text-page-muted">
                      {r.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm text-muted-foreground">
              A sample ranking for a sample posting. The scores are the
              model&apos;s judgment: use the order to decide where to look first.
            </p>

            <div className="mt-8">
              <CtaButton signedOutLabel="Screen a stack" size="lg" withArrow />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
