import type { Metadata } from "next";
import { MatchStepper } from "@/components/dashboard/match/match-stepper";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Job Fit" };

export default function MatchPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Job Fit"
        description="Read your resume against one job posting. You get a score, what matches, what is missing, and the lines to reword."
      />
      <MatchStepper />
    </div>
  );
}
