"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-data";
import {
  MAX_RESUME_PAGES,
  MAX_SCREENING_RESUMES,
  MAX_UPLOAD_MB,
  RESUME_FORMATS_LABEL,
} from "@/lib/api/limits";
import { plural } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";

function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 max-w-prose space-y-3 text-base text-muted-foreground">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  const { credits } = useDashboardData();
  const match = credits?.costs.match ?? 1;
  const letter = credits?.costs.cover_letter ?? 1;
  const perResume = credits?.costs.screening_per_resume ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Help" description="Short answers to what people ask first." />

      <div className="space-y-6">
        <Topic title="What costs a credit">
          <p>
            You start with 10. A Job Fit analysis costs {plural(match, "credit")}. A cover letter
            draft costs {plural(letter, "credit")}. The Screener costs {plural(perResume, "credit")}{" "}
            per resume.
          </p>
          <p>
            Uploading resumes, adding job postings and the tailored bullets (once per analysis)
            are free. The price is always shown before you spend anything, and a credit comes
            back if the work fails. There are no plans and no card.
          </p>
        </Topic>

        <Topic title="What you can upload">
          <p>
            {RESUME_FORMATS_LABEL}, up to {MAX_UPLOAD_MB} MB and {MAX_RESUME_PAGES} pages. Scanned
            PDFs are read automatically. The Screener takes up to {MAX_SCREENING_RESUMES} resumes
            at a time.
          </p>
          <p>
            A document that is not a resume, or a page that is not a job posting, is refused
            with a reason, and you are not charged. For a posting, you can paste its text if a
            site will not let us read the link.
          </p>
        </Topic>

        <Topic title="How to read a report">
          <p>
            Red pencil marks something to fix. Blue marks something that already works. The
            handwritten notes in the margin say how much a fix matters and how hard it is.
            Every mark has words next to it, so nothing depends on color.
          </p>
          <p>
            The score is a model&apos;s reading of your resume against that one posting. It is not
            an applicant-tracking result, and it cannot know what you left off the page. Use it
            to decide what to change, not as a verdict.
          </p>
          <p>
            Use Print on a report to save it as a PDF. The tailored bullets and cover letter are
            included once you have made them.
          </p>
        </Topic>

        <Topic title="Your files and your data">
          <p>
            Your resumes, postings and reports are kept until you delete them. Deleting a resume
            or a posting also deletes the reports made from it. In{" "}
            <Link href="/dashboard/settings?tab=account" className="font-semibold text-foreground underline underline-offset-4">
              Settings
            </Link>{" "}
            you can download everything or delete your account.
          </p>
          <p>
            The{" "}
            <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-4">
              privacy policy
            </Link>{" "}
            says what is stored and who else touches it.
          </p>
        </Topic>

        <Topic title="Something is wrong">
          <p>
            If a credit went missing, a report looks wrong or something will not load, tell us
            what you were doing and we will look.
          </p>
          <Button asChild className="mt-1">
            <Link href="/contact">Contact us</Link>
          </Button>
        </Topic>
      </div>
    </div>
  );
}
