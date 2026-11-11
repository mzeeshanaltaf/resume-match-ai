"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api, isAbortError, waitForJob } from "@/lib/api/client";
import { MAX_SCREENING_RESUMES } from "@/lib/api/limits";
import type { JobStep, ScreeningResult } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { CostLedger } from "@/components/dashboard/cost-ledger";
import { NoCredits, RequestError } from "@/components/dashboard/notes";
import { StepList } from "@/components/dashboard/step-list";
import { FlowSteps } from "@/components/dashboard/flow/flow-steps";
import { JobPostingStep } from "@/components/dashboard/flow/job-posting-step";
import { useJobPosting } from "@/components/dashboard/flow/use-job-posting";
import { MultiResumePicker } from "@/components/dashboard/flow/resume-picker";
import { ScreenResults } from "./screen-results";

type Step = 1 | 2 | 3 | 4;

const STEPS = ["Resumes", "Job posting", "Screen", "Ranking"];

/** Heading for a screening run: its steps are one `score:<id>` per resume, then `ranking`. */
function progressHeading(steps: JobStep[], total: number): string {
  if (steps.some((s) => s.name === "ranking")) return "Ranking the candidates";
  const scoring = steps.filter((s) => s.name.startsWith("score:"));
  if (scoring.length === 0) return "Screening";
  const done = scoring.filter((s) => s.status !== "running").length;
  return `Scoring resumes (${done} of ${total} done)`;
}

/** The Resume Screener: many resumes, one posting, a ranked pile. */
export function ScreenStepper() {
  const { refreshAll, credits, creditBalance } = useDashboardData();
  const posting = useJobPosting("recruiter");

  const [step, setStep] = useState<Step>(1);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState<boolean | null>(null);
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [jdId, setJdId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const perResume = credits?.costs.screening_per_resume ?? 1;
  const total = resumeIds.length * perResume;
  const tooFew = creditBalance !== null && creditBalance < total;

  function reset() {
    abortRef.current?.abort();
    posting.reset();
    setStep(1);
    setPickedIds([]);
    setShowUpload(null);
    setResumeIds([]);
    setJdId(null);
    setRunning(false);
    setSteps([]);
    setError(null);
    setResult(null);
  }

  async function screen() {
    if (!jdId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setSteps([]);
    try {
      const { job_id } = await api.screenings.create(resumeIds, jdId, controller.signal);
      const res = await waitForJob<ScreeningResult>(job_id, {
        onSteps: setSteps,
        signal: controller.signal,
      });
      setResult(res);
      setStep(4);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err);
    } finally {
      if (!controller.signal.aborted) setRunning(false);
      // Credits were spent, and any failed resume refunded; history and counts moved.
      refreshAll();
    }
  }

  return (
    <div className="space-y-8">
      <FlowSteps steps={STEPS} current={step} />

      <div className={step === 4 ? "max-w-4xl" : "max-w-2xl"}>
        {step === 1 && (
          <MultiResumePicker
            max={MAX_SCREENING_RESUMES}
            selectedIds={pickedIds}
            showUpload={showUpload}
            onSelectedIdsChange={setPickedIds}
            onShowUploadChange={setShowUpload}
            onNext={(ids) => {
              setResumeIds(ids);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <JobPostingStep
            posting={posting}
            intro={`All ${plural(resumeIds.length, "resume")} are scored against this one posting. Adding it is free.`}
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
              <h2 className="text-lg font-semibold">Ready to screen</h2>
              <p className="mt-1 text-base text-muted-foreground">
                {plural(resumeIds.length, "resume")} against{" "}
                {posting.label ? <strong className="font-semibold">{posting.label}</strong> : "the posting"}.
                You get a ranked list with a short reason for each position.
              </p>
            </div>

            <div className="space-y-2">
              <CostLedger
                rows={[
                  {
                    label: `${plural(resumeIds.length, "resume")} at ${plural(perResume, "credit")} each`,
                    amount: -total,
                  },
                ]}
                balance={creditBalance}
              />
              <p className="text-sm text-muted-foreground">
                The cost is reserved up front. A resume that cannot be scored is refunded.
              </p>
            </div>

            {tooFew && !running && (
              <NoCredits needed={total} balance={creditBalance} />
            )}

            {running && (
              <StepList
                heading={progressHeading(steps, resumeIds.length)}
                steps={steps}
                note="You can leave this page. The scores will be in History when they finish."
              />
            )}

            {error != null && !running && (
              <RequestError
                error={error}
                title="The screening did not finish"
                fallback="The screening did not finish."
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={running}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={screen} disabled={running || tooFew}>
                {running
                  ? "Screening"
                  : error != null
                    ? "Try again"
                    : `Screen (${plural(total, "credit")})`}
              </Button>
            </div>
          </section>
        )}

        {step === 4 && result && <ScreenResults result={result} onReset={reset} />}
      </div>
    </div>
  );
}
