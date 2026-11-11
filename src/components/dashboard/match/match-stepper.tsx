"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api, isAbortError, waitForJob } from "@/lib/api/client";
import type { JobStep, MatchJobResult } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { CostLedger } from "@/components/dashboard/cost-ledger";
import { NoCredits, RequestError } from "@/components/dashboard/notes";
import { StepList } from "@/components/dashboard/step-list";
import { FlowSteps } from "@/components/dashboard/flow/flow-steps";
import { JobPostingStep } from "@/components/dashboard/flow/job-posting-step";
import { useJobPosting } from "@/components/dashboard/flow/use-job-posting";
import { ResumePicker } from "@/components/dashboard/flow/resume-picker";

type Step = 1 | 2 | 3;

const STEPS = ["Resume", "Job posting", "Analyze"];

/**
 * Job Fit: choose a resume, add a posting, spend one credit. The result is the
 * report page (`/dashboard/reports/[id]`), not a step inside this flow.
 */
export function MatchStepper() {
  const router = useRouter();
  const { refreshAll, credits, creditBalance, resumes } = useDashboardData();
  const posting = useJobPosting("candidate");

  const [step, setStep] = useState<Step>(1);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState<boolean | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [jdId, setJdId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const cost = credits?.costs.match ?? 1;
  const tooFew = creditBalance !== null && creditBalance < cost;
  const resume = resumes?.find((r) => r.id === resumeId);

  async function analyze() {
    if (!jdId || !resumeId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setSteps([]);
    try {
      const { job_id } = await api.matches.create(resumeId, jdId, controller.signal);
      const result = await waitForJob<MatchJobResult>(job_id, {
        onSteps: setSteps,
        signal: controller.signal,
      });
      router.push(`/dashboard/reports/${result.match_id}`);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err);
      setRunning(false);
    } finally {
      // The balance moved (spent, or refunded after a failure); so did the history.
      refreshAll();
    }
  }

  return (
    <div className="space-y-8">
      <FlowSteps steps={STEPS} current={step} />

      <div className="max-w-2xl">
        {step === 1 && (
          <ResumePicker
            selectedId={pickedId}
            showUpload={showUpload}
            onSelectedIdChange={setPickedId}
            onShowUploadChange={setShowUpload}
            onNext={(id) => {
              setResumeId(id);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <JobPostingStep
            posting={posting}
            intro="Link to the posting, or paste its text. Adding a posting is free."
            onBack={() => setStep(1)}
            onAdded={(id) => {
              setJdId(id);
              setError(null);
              setStep(3);
            }}
          />
        )}

        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Ready to analyze</h2>
              <p className="mt-1 text-base text-muted-foreground">
                Your resume is read against the posting, line by line.
              </p>
            </div>

            <dl className="max-w-sm divide-y divide-border border-y border-border text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Resume</dt>
                <dd className="min-w-0 truncate text-right font-medium">
                  {resume?.file_name ?? "Your resume"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Posting</dt>
                <dd className="min-w-0 truncate text-right font-medium">
                  {posting.label ?? "Job posting"}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <CostLedger
                rows={[{ label: "One analysis", amount: -cost }]}
                balance={creditBalance}
              />
              <p className="text-sm text-muted-foreground">
                {plural(cost, "credit")} is returned if the analysis fails.
              </p>
            </div>

            {tooFew && !running && <NoCredits needed={cost} balance={creditBalance} />}

            {running && (
              <StepList
                heading="Analyzing"
                steps={steps}
                note="You can leave this page. The report will be in History when it finishes."
              />
            )}

            {error != null && !running && (
              <RequestError
                error={error}
                title="The analysis did not finish"
                fallback="The analysis did not finish."
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={running}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={analyze} disabled={running || tooFew}>
                {running ? "Analyzing" : error != null ? "Try again" : `Analyze (${plural(cost, "credit")})`}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
