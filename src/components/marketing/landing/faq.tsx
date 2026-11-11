import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * The answers are also emitted as FAQPage JSON-LD by the landing page, built
 * from this same array so the two can never drift apart.
 */
export const faqs: { q: string; a: string }[] = [
  {
    q: "Do you keep my resume?",
    a: "Yes. We store the original file and the text read from it so you can run it against more postings. You can delete any resume yourself, and deleting your account erases everything we hold: resumes, postings, reports, generated documents and credit history. You can download all of it first from your settings.",
  },
  {
    q: "What leaves your servers?",
    a: "The text of your resume and the posting is sent to OpenAI to write the analysis, and a job-posting link you submit is fetched through Firecrawl. Sign-in codes are sent by Resend. We use no advertising networks and no tracking pixels, and our site analytics are cookieless.",
  },
  {
    q: "What file types can I upload?",
    a: "PDF, DOCX or plain text, up to 5 MB and 5 pages. Scanned PDFs are read with OCR. Each upload is checked to be a real resume (or a real job posting) before anything is stored, and a rejected upload costs nothing.",
  },
  {
    q: "How much should I trust the score?",
    a: "Treat it as a careful second reader, not a verdict. A score is a model's judgment, not the result of any applicant tracking system, and it can be wrong. The reasons next to it are the useful part: read them, check them against your resume, and ignore the ones that are not true.",
  },
  {
    q: "Is this fair to use for screening candidates?",
    a: "It is built to help you decide where to look first, not who to reject. Each ranking comes with a short reason you can check against the resume. People should make the hiring decision, and a model's score should never be the only basis for one.",
  },
  {
    q: "Will it pay anything later?",
    a: "There are no paid plans today and nothing to buy. Credits are how usage is counted. If that ever changes, this page will say so before it does.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20">
        <div>
          <h2 className="text-[clamp(1.875rem,1.3rem+2.2vw,2.75rem)] font-bold leading-[1.1] tracking-[-0.02em]">
            Questions people ask first.
          </h2>
          <p className="mt-4 max-w-[26rem] leading-relaxed text-muted-foreground">
            Still not sure about something?{" "}
            <Link
              href="/contact"
              className="font-medium text-foreground underline underline-offset-4 decoration-1 hover:decoration-2"
            >
              Ask us
            </Link>
            .
          </p>
        </div>

        <div className="border-t border-border">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group border-b border-border">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                {q}
                <Plus
                  aria-hidden
                  className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-open:rotate-45"
                />
              </summary>
              <p className="max-w-[40rem] pb-6 pr-10 leading-relaxed text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
