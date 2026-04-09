"use client";

import { useState } from "react";
import { CheckCircle2, ArrowLeft, ScanSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-data";
import { MultiResumePicker } from "./multi-resume-picker";
import { ScreenResults, type ScreenResultItem } from "./screen-results";
import type { ResumeRecord, ResumeMatchResponse } from "@/types/n8n";

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

const SCREENING_STEPS: ProgressStep[] = [
  { message: "Analyzing Resume...", duration: 5000 },
  { message: "Analyzing Job Description...", duration: 5000 },
  { message: "Generating Report...", duration: 5000 },
  { message: "Almost there...", duration: Infinity },
];

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "Resumes" },
  { id: 2, label: "Job description" },
  { id: 3, label: "Screening" },
  { id: 4, label: "Results" },
];

export function ScreenStepper() {
  const { refreshAll } = useDashboardData();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  // Picker state lifted here so going Back preserves uploaded resumes
  const [pickerResumes, setPickerResumes] = useState<ResumeRecord[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [pickerShowUpload, setPickerShowUpload] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<ResumeRecord[]>([]);
  const [results, setResults] = useState<ScreenResultItem[]>([]);
  const [jdMode, setJdMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [urlId, setUrlId] = useState("");
  const [processingJd, setProcessingJd] = useState(false);
  const [screening, setScreening] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, status: "" });
  const [screenError, setScreenError] = useState<string | null>(null);

  function reset() {
    setCurrentStep(1);
    setPickerResumes([]);
    setPickerSelectedIds([]);
    setPickerShowUpload(true);
    setSelectedIds([]);
    setSelectedResumes([]);
    setResults([]);
    setJdMode("url");
    setUrl("");
    setJdText("");
    setUrlId("");
    setProcessingJd(false);
    setScreening(false);
    setProgress({ done: 0, total: 0, status: "" });
    setScreenError(null);
  }

  async function processJd() {
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
    setProcessingJd(true);
    try {
      const jdBody: Record<string, unknown> = { is_candidate: false };
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
      const { url_id } = await jdRes.json();
      setUrlId(url_id);
      setScreenError(null);
      setCurrentStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process job description.");
    } finally {
      setProcessingJd(false);
    }
  }

  async function startScreening() {
    setScreening(true);
    setScreenError(null);
    setProgress({ done: 0, total: selectedIds.length, status: `Screening resume 1 of ${selectedIds.length}…` });

    try {
      const screenResults: ScreenResultItem[] = await Promise.all(
        selectedIds.map(async (file_id) => {
          const resume = selectedResumes.find((r) => r.file_id === file_id);
          const file_name = resume?.file_name ?? file_id;
          try {
            const matchRes = await fetch("/api/match/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ file_id, url_id: urlId, is_candidate: false }),
            });
            if (!matchRes.ok) throw new Error();
            const result: ResumeMatchResponse = await matchRes.json();
            setProgress((p) => {
              const done = p.done + 1;
              return {
                done,
                total: p.total,
                status: done < p.total ? `Screening resume ${done + 1} of ${p.total}…` : "Finishing up…",
              };
            });
            return { file_id, file_name, status: "success" as const, result };
          } catch {
            setProgress((p) => {
              const done = p.done + 1;
              return {
                done,
                total: p.total,
                status: done < p.total ? `Screening resume ${done + 1} of ${p.total}…` : "Finishing up…",
              };
            });
            return { file_id, file_name, status: "error" as const };
          }
        })
      );

      setResults(screenResults);
      refreshAll();
      toast.success("Screening complete!");
      setCurrentStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setScreenError(msg);
      toast.error(msg);
    } finally {
      setScreening(false);
    }
  }

  return (
    <>
    <ShimmeringProgressDialog
      open={processingJd}
      title="Processing Job Description"
      steps={jdMode === "url" ? JD_URL_STEPS : JD_TEXT_STEPS}
    />
    <ShimmeringProgressDialog
      open={screening}
      title="Screening"
      steps={SCREENING_STEPS}
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
                <div className={cn("mx-3 h-px w-8 sm:w-12", done ? "bg-emerald-500" : "bg-border")} />
              )}
            </div>
          );
        })}
      </nav>

      {/* Step content */}
      <div className="max-w-3xl">
        {/* Step 1: Upload Resumes */}
        {currentStep === 1 && (
          <MultiResumePicker
            onNext={(ids, resumes) => {
              setSelectedIds(ids);
              setSelectedResumes(resumes);
              setCurrentStep(2);
            }}
            resumes={pickerResumes}
            selectedIds={pickerSelectedIds}
            showUpload={pickerShowUpload}
            onResumesChange={setPickerResumes}
            onSelectedIdsChange={setPickerSelectedIds}
            onShowUploadChange={setPickerShowUpload}
          />
        )}

        {/* Step 2: Job Description */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Enter job description</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All {selectedIds.length} resume{selectedIds.length !== 1 ? "s" : ""} will
                be screened against this job posting.
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
                onKeyDown={(e) => e.key === "Enter" && processJd()}
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
                onClick={processJd}
                disabled={(jdMode === "url" ? !url.trim() : !jdText.trim()) || processingJd}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
              >
                <><ScanSearch className="h-4 w-4" /> Process JD</>

              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Screening */}
        {currentStep === 3 && (
          <div className="flex flex-col items-center py-12 text-center">
            {screenError ? (
              <>
                <h2 className="text-lg font-semibold text-destructive">Screening failed</h2>
                <p className="mt-2 text-sm text-muted-foreground">{screenError}</p>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setScreenError(null);
                      setScreening(false);
                      setProgress({ done: 0, total: 0, status: "" });
                    }}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    Retry
                  </Button>
                </div>
              </>
            ) : screening ? (
              /* ShimmeringProgressDialog handles UX during screening */
              null
            ) : (
              <>
                <ScanSearch className="mb-4 h-10 w-10 text-emerald-500" />
                <h2 className="text-lg font-semibold">Ready to screen</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedIds.length} resume{selectedIds.length !== 1 ? "s" : ""} will be screened against the job description.
                </p>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={startScreening}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    <ScanSearch className="h-4 w-4" /> Start Screening
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Results */}
        {currentStep === 4 && (
          <ScreenResults items={results} onReset={reset} />
        )}
      </div>
    </div>
    </>
  );
}
