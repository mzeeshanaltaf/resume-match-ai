import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { ScreenStepper } from "@/components/dashboard/screen/screen-stepper";

export const metadata: Metadata = { title: "Resume Screener" };

export default function ScreenPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Resume Screener"
        description="Score a stack of resumes against one job posting and get them ranked, each with a short reason you can check."
      />
      <ScreenStepper />
    </div>
  );
}
