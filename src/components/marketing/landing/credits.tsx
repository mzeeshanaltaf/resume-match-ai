import { CtaButton } from "@/components/marketing/cta-button";
import { MarginNote } from "@/components/proof";

const ledger: { label: string; amount: string; spend?: boolean; note?: string }[] = [
  { label: "You sign up", amount: "+10" },
  { label: "Upload your resume", amount: "free" },
  { label: "Add the Product Analyst posting", amount: "free" },
  { label: "Analyse resume against posting", amount: "−1", spend: true },
  { label: "Reworded bullets for that analysis", amount: "free", note: "once per analysis" },
  { label: "Draft a cover letter", amount: "−1", spend: true },
  { label: "Analyse against the Data Analyst posting", amount: "−1", spend: true },
];

export function Credits() {
  return (
    <section id="credits" className="border-y border-border bg-secondary">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20 lg:px-8">
        <div>
          <h2 className="max-w-[18ch] text-[clamp(1.875rem,1.3rem+2.2vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em] text-balance">
            Ten free credits. One per analysis.
          </h2>
          <div className="mt-5 max-w-[34rem] space-y-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
            <p>
              You start with 10 credits and nothing to enter. Uploading
              resumes and adding job postings is free, so you can set
              everything up before you spend anything.
            </p>
            <p>
              An analysis costs 1 credit. A cover letter draft costs 1.
              Screening a stack for a recruiter costs 1 per resume, and the
              credit comes back for any resume that cannot be read. The app
              shows the price before you spend it.
            </p>
            <p>
              There are no plans, no subscription and no card.
            </p>
          </div>
          <div className="mt-8">
            <CtaButton signedOutLabel="Start with 10 free credits" size="lg" withArrow />
          </div>
        </div>

        <figure>
          <div className="rounded-page bg-page px-5 py-5 text-page-foreground shadow-sheet sm:px-7 sm:py-6">
            <figcaption className="font-sans text-sm font-semibold">
              Example credit ledger
            </figcaption>
            <table className="mt-3 w-full border-collapse text-[0.9375rem]">
              <caption className="sr-only">
                Example of how credits move: 10 on sign up, then 1 per analysis
                or cover letter. Uploads and job postings are free.
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-page-rule font-serif">
                {ledger.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {row.label}
                      {row.note && (
                        <span className="block text-sm text-page-muted">{row.note}</span>
                      )}
                    </th>
                    <td
                      className={
                        "whitespace-nowrap py-2 text-right font-sans font-semibold tabular-nums " +
                        (row.spend ? "text-page-pencil" : row.amount === "free" ? "text-page-muted font-normal" : "text-page-proof")
                      }
                    >
                      {row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-end justify-between border-t-2 border-page-foreground pt-3">
              <span className="font-sans text-sm font-semibold">Balance</span>
              <span className="text-[2.25rem] leading-none">
                <MarginNote arrow={false} tone="ink" tilt={-2} delay={0.2} duration={0.9}>
                  7 left
                </MarginNote>
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            An example, not a real account.
          </p>
        </figure>
      </div>
    </section>
  );
}
