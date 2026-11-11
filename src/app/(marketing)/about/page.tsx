import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { CtaButton } from "@/components/marketing/cta-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "What ResuMatchAI does, what it does not do, and what happens to the documents you give it.",
  alternates: { canonical: "/about" },
};

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "What it does",
    body: (
      <>
        <p>
          ResuMatchAI reads a resume and a job posting side by side and tells
          you how well they fit, and why. You get a score, the requirements the
          resume meets, the ones it does not, wording you could change, and the
          posting&apos;s own keywords that your resume never uses. If you are
          applying, it can also rewrite bullets and draft a cover letter from
          the same analysis.
        </p>
        <p>
          If you are the one reading applications, you can add a posting and up
          to 20 resumes and get them ranked, each with a short reason you can
          check against the resume.
        </p>
      </>
    ),
  },
  {
    title: "What it does not do",
    body: (
      <>
        <p>
          It does not know what any particular applicant tracking system or
          hiring manager will do. A score is a language model&apos;s judgment of
          fit, and it can be wrong, so the reasons matter more than the number.
        </p>
        <p>
          It does not promise interviews or offers, and it should never be the
          only basis for a hiring decision. It suggests wording based on what
          your resume already says. Adding a skill you do not have is your call,
          and not one we will encourage.
        </p>
      </>
    ),
  },
  {
    title: "What happens to your documents",
    body: (
      <>
        <p>
          We keep the original file and the text read from it, so you can match
          the same resume against more postings. You can delete any resume or
          report whenever you like. Deleting your account erases all of it, and
          you can download a copy first.
        </p>
        <p>
          To write an analysis, the text of your resume and the posting is sent
          to OpenAI. Job-posting links are fetched through Firecrawl. The{" "}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-4"
          >
            privacy policy
          </Link>{" "}
          has the full list.
        </p>
      </>
    ),
  },
  {
    title: "What it costs",
    body: (
      <p>
        Every account starts with 10 free credits. Uploading resumes and adding
        postings is free; an analysis costs 1 credit. There are no plans and no
        card to enter. The{" "}
        <Link
          href="/#credits"
          className="font-medium text-foreground underline underline-offset-4"
        >
          credits section
        </Link>{" "}
        on the home page shows how they move.
      </p>
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-border px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h1 className="max-w-[16ch] text-[clamp(2.5rem,1.2rem+3.6vw,4.25rem)] font-bold leading-[1.04] tracking-[-0.025em] text-balance">
              A second reader for your resume.
            </h1>
            <p className="mt-6 max-w-[40rem] text-[1.0625rem] leading-relaxed text-muted-foreground sm:text-lg">
              Most resumes are sent without anyone having read them against the
              job first. ResuMatchAI does that reading, and writes down what it
              found so you can judge it yourself.
            </p>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <div className="mx-auto max-w-6xl divide-y divide-border border-y border-border">
            {sections.map(({ title, body }) => (
              <div
                key={title}
                className="grid gap-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16"
              >
                <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                <div className="max-w-[40rem] space-y-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
                  {body}
                </div>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center gap-3">
            <CtaButton signedOutLabel="Try it with 10 free credits" size="lg" withArrow />
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">Ask us something</Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
