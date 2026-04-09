"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, ArrowLeft, FileSearch, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-data";
import { ResumePicker } from "./resume-picker";
import { MatchResults } from "./match-results";
import type { ResumeMatchResponse, ResumeRecord } from "@/types/n8n";
import { ShimmeringProgressDialog, type ProgressStep } from "@/components/dashboard/shimmering-progress-dialog";

const JD_URL_STEPS: ProgressStep[] = [
  { message: "Getting Job Description...", duration: 5000 },
  { message: "Analyzing Job Description...", duration: 5000 },
  { message: "Extracting Details...", duration: 10000 },
  { message: "Almost there...", duration: Infinity },
];

const JD_TEXT_STEPS: ProgressStep[] = [
  { message: "Analyzing Job Description...", duration: 5000 },
  { message: "Extracting Details...", duration: 10000 },
  { message: "Almost there...", duration: Infinity },
];

const ANALYZE_STEPS: ProgressStep[] = [
  { message: "Analyzing Resume...", duration: 5000 },
  { message: "Analyzing Job Description...", duration: 5000 },
  { message: "Generating Report...", duration: 15000 },
  { message: "Almost there...", duration: Infinity },
];

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "Resume" },
  { id: 2, label: "Job description" },
  { id: 3, label: "Analyze" },
  { id: 4, label: "Results" },
];

export function MatchStepper() {
  const { refreshAll } = useDashboardData();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  // Picker state lifted here so going Back preserves uploaded resumes
  const [pickerResumes, setPickerResumes] = useState<ResumeRecord[]>([]);
  const [pickerSelectedId, setPickerSelectedId] = useState<string | null>(null);
  const [pickerShowUpload, setPickerShowUpload] = useState(true);
  const [jdMode, setJdMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [matchResult, setMatchResult] = useState<ResumeMatchResponse | null>(null);

  // Step 3 sub-states
  const [jdStatus, setJdStatus] = useState<"processing" | "done" | "error">("processing");
  const [jdUrlId, setJdUrlId] = useState<string | null>(null);
  const [processedJdInput, setProcessedJdInput] = useState<{ mode: "url" | "text"; value: string } | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const jdStarted = useRef(false);

  function reset() {
    setCurrentStep(1);
    setSelectedResumeId(null);
    setPickerResumes([]);
    setPickerSelectedId(null);
    setPickerShowUpload(true);
    setJdMode("url");
    setUrl("");
    setJdText("");
    setMatchResult(null);
    setJdStatus("processing");
    setJdUrlId(null);
    setProcessedJdInput(null);
    setJdError(null);
    setMatchLoading(false);
    setMatchError(null);
    jdStarted.current = false;
  }

  // Step 3: auto-process JD when entering this step
  useEffect(() => {
    if (currentStep !== 3 || jdStarted.current) return;
    jdStarted.current = true;

    async function processJd() {
      try {
        setJdStatus("processing");
        setJdError(null);
        const jdBody: Record<string, unknown> = { is_candidate: true };
        if (jdMode === "url") {
          jdBody.url = url.trim();
        } else {
          jdBody.url = "";
          jdBody.jd_text = jdText.trim();
        }
        const jdRes = await fetch("/api/jd/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jdBody),
        });
        if (!jdRes.ok) throw new Error("Failed to process job description.");
        const data = await jdRes.json();
        const urlId = data.url_id;
        if (!urlId) throw new Error("Job description processed but no URL ID returned.");
        setJdUrlId(urlId);
        setJdStatus("done");
        setProcessedJdInput({ mode: jdMode, value: jdMode === "url" ? url.trim() : jdText.trim() });
        toast.success("Job description processed!");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setJdError(msg);
        setJdStatus("error");
        toast.error(msg);
      }
    }

    processJd();
  }, [currentStep, url, jdText, jdMode]);

  async function runAnalysis() {
    if (!jdUrlId || !selectedResumeId) return;
    setMatchLoading(true);
    setMatchError(null);
    try {
      const matchRes = await fetch("/api/match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: selectedResumeId,
          url_id: jdUrlId,
          is_candidate: true,
        }),
      });
      if (!matchRes.ok) throw new Error("Match analysis failed.");
      const result = await matchRes.json();
      setMatchResult(result);
      refreshAll();
      toast.success("Analysis complete!");
      setCurrentStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
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
    if (jdUrlId && jdStatus === "done" && processedJdInput?.mode === jdMode && processedJdInput?.value === currentValue) {
      setCurrentStep(3);
      return;
    }

    jdStarted.current = false;
    setJdError(null);
    setJdStatus("processing");
    setJdUrlId(null);
    setMatchError(null);
    setMatchLoading(false);
    setCurrentStep(3);
  }

  const jdReady = jdMode === "url" ? !!url.trim() : !!jdText.trim();

  return (
    <>
    <ShimmeringProgressDialog
      open={currentStep === 3 && jdStatus === "processing"}
      title="Processing Job Description"
      steps={jdMode === "url" ? JD_URL_STEPS : JD_TEXT_STEPS}
    />
    <ShimmeringProgressDialog
      open={matchLoading}
      title="Analyzing"
      steps={ANALYZE_STEPS}
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
            onNext={(fileId) => {
              setSelectedResumeId(fileId);
              setCurrentStep(2);
            }}
            resumes={pickerResumes}
            selectedId={pickerSelectedId}
            showUpload={pickerShowUpload}
            onResumesChange={setPickerResumes}
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
                    onClick={() => {
                      jdStarted.current = false;
                      setJdError(null);
                      setJdStatus("processing");
                      setCurrentStep(3);
                    }}
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
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={runAnalysis}
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
