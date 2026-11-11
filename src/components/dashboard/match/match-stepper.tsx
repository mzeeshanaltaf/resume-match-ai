"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ArrowLeft, FileSearch, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api, isApiError, waitForJob } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type {
  JobDescriptionJobResult,
  JobStep,
  MatchJobResult,
  MatchOut,
} from "@/lib/api/types";
import { ResumePicker } from "./resume-picker";
import { MatchResults } from "./match-results";
import { ShimmeringProgressDialog } from "@/components/dashboard/shimmering-progress-dialog";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "Resume" },
  { id: 2, label: "Job description" },
  { id: 3, label: "Analyze" },
  { id: 4, label: "Results" },
];

export function MatchStepper() {
  const { refreshAll, credits, creditBalance } = useDashboardData();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  // Picker state lifted here so going Back preserves the selection
  const [pickerSelectedId, setPickerSelectedId] = useState<string | null>(null);
  const [pickerShowUpload, setPickerShowUpload] = useState<boolean | null>(null);
  const [jdMode, setJdMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [matchResult, setMatchResult] = useState<MatchOut | null>(null);

  // Step 3 sub-states
  const [jdStatus, setJdStatus] = useState<"processing" | "done" | "error">("processing");
  const [jdId, setJdId] = useState<string | null>(null);
  const [processedJdInput, setProcessedJdInput] = useState<{ mode: "url" | "text"; value: string } | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  // Bump to (re)start job description processing while on step 3
  const [jdRun, setJdRun] = useState(0);
  const [jdSteps, setJdSteps] = useState<JobStep[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchSteps, setMatchSteps] = useState<JobStep[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);

  const matchCost = credits?.costs.match ?? 1;
  const notEnoughCredits = creditBalance !== null && creditBalance < matchCost;

  function reset() {
    setCurrentStep(1);
    setSelectedResumeId(null);
    setPickerSelectedId(null);
    setPickerShowUpload(null);
    setJdMode("url");
    setUrl("");
    setJdText("");
    setMatchResult(null);
    setJdStatus("processing");
    setJdId(null);
    setProcessedJdInput(null);
    setJdError(null);
    setJdRun(0);
    setJdSteps([]);
    setMatchLoading(false);
    setMatchSteps([]);
    setMatchError(null);
  }

  // Step 3: process the JD (as a backend job) when entering the step or on retry
  useEffect(() => {
    if (currentStep !== 3 || jdRun === 0) return;
    const value = jdMode === "url" ? url.trim() : jdText.trim();

    async function processJd() {
      try {
        setJdStatus("processing");
        setJdError(null);
        setJdSteps([]);
        const body =
          jdMode === "url"
            ? { url: value, mode: "candidate" as const }
            : { text: value, mode: "candidate" as const };
        const { job_id } = await api.jobDescriptions.submit(body);
        const result = await waitForJob<JobDescriptionJobResult>(job_id, { onSteps: setJdSteps });
        setJdId(result.jd_id);
        setJdStatus("done");
        setProcessedJdInput({ mode: jdMode, value });
        toast.success("Job description processed!");
      } catch (err) {
        // The same posting was added before: reuse it instead of failing.
        const existing = isApiError(err, "DUPLICATE_JD") ? err.details?.jd_id : null;
        if (typeof existing === "string") {
          setJdId(existing);
          setJdStatus("done");
          setProcessedJdInput({ mode: jdMode, value });
          toast.info("You've already added this job description. Using the existing one.");
          return;
        }
        const msg = describeError(err, "Failed to process job description.");
        setJdError(msg);
        setJdStatus("error");
        toast.error(msg);
      }
    }

    processJd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, jdRun]);

  async function runAnalysis() {
    if (!jdId || !selectedResumeId) return;
    setMatchLoading(true);
    setMatchError(null);
    setMatchSteps([]);
    try {
      const { job_id } = await api.matches.create(selectedResumeId, jdId);
      const result = await waitForJob<MatchJobResult>(job_id, { onSteps: setMatchSteps });
      setMatchResult(result.match);
      toast.success("Analysis complete!");
      setCurrentStep(4);
    } catch (err) {
      const msg = describeError(err, "Match analysis failed.");
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
      // Balance changed (spent, or refunded on failure); counts and history too.
      refreshAll();
    }
  }

  function goToStep3() {
    const currentValue = jdMode === "url" ? url.trim() : jdText.trim();

    if (jdMode === "url") {
      if (!url.trim()) {
        toast.error("Please enter a job posting URL.");
        return;
      }
      try {
        new URL(url.trim());
      } catch {
        toast.error("Please enter a valid URL.");
        return;
      }
    } else {
      if (!jdText.trim()) {
        toast.error("Please paste the job description text.");
        return;
      }
    }

    // Skip reprocessing if the same JD was already processed successfully
    if (jdId && jdStatus === "done" && processedJdInput?.mode === jdMode && processedJdInput?.value === currentValue) {
      setMatchError(null);
      setCurrentStep(3);
      return;
    }

    setJdError(null);
    setJdStatus("processing");
    setJdId(null);
    setMatchError(null);
    setMatchLoading(false);
    setJdRun((n) => n + 1);
    setCurrentStep(3);
  }

  const jdReady = jdMode === "url" ? !!url.trim() : !!jdText.trim();

  return (
    <>
    <ShimmeringProgressDialog
      open={currentStep === 3 && jdStatus === "processing"}
      title="Processing Job Description"
      steps={jdSteps}
    />
    <ShimmeringProgressDialog
      open={matchLoading}
      title="Analyzing"
      steps={matchSteps}
    />
    <div className="space-y-8">
      {/* Step indicator */}
      <nav aria-label="Progress" className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = step.id < currentStep;
          const active = step.id === currentStep;
          return (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : active
                        ? "border-2 border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-2 border-border text-muted-foreground"
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                </div>
                <span
                  className={cn(
                    "text-sm hidden sm:inline",
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-3 h-px w-8 sm:w-12",
                    done ? "bg-emerald-500" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Step content */}
      <div className="max-w-2xl">
        {/* Step 1: Resume Processing */}
        {currentStep === 1 && (
          <ResumePicker
            onNext={(resumeId) => {
              setSelectedResumeId(resumeId);
              setCurrentStep(2);
            }}
            selectedId={pickerSelectedId}
            showUpload={pickerShowUpload}
            onSelectedIdChange={setPickerSelectedId}
            onShowUploadChange={setPickerShowUpload}
          />
        )}

        {/* Step 2: Job Description */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Add job description</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Provide the job posting URL or paste the description text.
              </p>
            </div>

            <div className="flex gap-1 rounded-lg border border-border p-1 w-fit bg-muted/30">
              <button
                onClick={() => setJdMode("url")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  jdMode === "url" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Job URL
              </button>
              <button
                onClick={() => setJdMode("text")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  jdMode === "text" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Paste text
              </button>
            </div>

            {jdMode === "url" ? (
              <Input
                type="url"
                placeholder="https://company.com/careers/job-title"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goToStep3()}
                className="max-w-lg"
              />
            ) : (
              <Textarea
                placeholder="Paste the full job description here…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={8}
                className="max-w-lg"
              />
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={goToStep3}
                disabled={!jdReady}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
              >
                <FileSearch className="h-4 w-4" /> Process JD
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Analyze Match */}
        {currentStep === 3 && (
          <div className="flex flex-col items-center py-12 text-center">
            {/* Sub-state: Processing JD — inline content hidden; ShimmeringProgressDialog handles UX */}
            {jdStatus === "processing" && null}

            {/* Sub-state: JD failed */}
            {jdStatus === "error" && (
              <>
                <h2 className="text-lg font-semibold text-destructive">
                  Job description processing failed
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{jdError}</p>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setJdRun((n) => n + 1)}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    Retry
                  </Button>
                </div>
              </>
            )}

            {/* Sub-state: JD done — show Analyze button or loading */}
            {jdStatus === "done" && !matchLoading && !matchError && (
              <>
                <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-500" />
                <h2 className="text-lg font-semibold">Job description processed</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ready to analyze your resume against this job description.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The analysis costs {matchCost} credit{matchCost === 1 ? "" : "s"}
                  {creditBalance !== null && <> · you have {creditBalance}</>}. It&apos;s refunded
                  if it fails.
                </p>
                {notEnoughCredits && (
                  <p className="mt-2 text-sm text-destructive">
                    You don&apos;t have enough credits to run this analysis.
                  </p>
                )}
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={runAnalysis}
                    disabled={notEnoughCredits}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    <Target className="h-4 w-4" /> Analyze Match
                  </Button>
                </div>
              </>
            )}

            {/* Sub-state: Match running — inline content hidden; ShimmeringProgressDialog handles UX */}
            {jdStatus === "done" && matchLoading && null}

            {/* Sub-state: Match failed */}
            {jdStatus === "done" && matchError && !matchLoading && (
              <>
                <h2 className="text-lg font-semibold text-destructive">Analysis failed</h2>
                <p className="mt-2 text-sm text-muted-foreground">{matchError}</p>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setMatchError(null);
                      runAnalysis();
                    }}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    Retry
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Results */}
        {currentStep === 4 && matchResult && (
          <MatchResults result={matchResult} onReset={reset} />
        )}
      </div>
    </div>
    </>
  );
}
