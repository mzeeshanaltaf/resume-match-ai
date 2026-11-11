"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, isAbortError, isApiError, waitForJob } from "@/lib/api/client";
import { MAX_JD_CHARS } from "@/lib/api/limits";
import { describeError } from "@/lib/api/errors";
import type {
  JobDescriptionJobResult,
  JobDescriptionOut,
  JobStep,
  Mode,
} from "@/lib/api/types";
import { useDashboardData } from "@/contexts/dashboard-data";

export type PostingKind = "url" | "text";

/** "Product Analyst, Acme" from the extracted fields, if there are any. */
export function postingLabel(jd: JobDescriptionOut | null | undefined): string | null {
  const o = jd?.jd_object;
  const parts = [o?.job_title, o?.company_name].filter(Boolean);
  return parts.length ? parts.join(", ") : (jd?.jd_url ?? null);
}

/**
 * State and submit logic for adding a job posting (a URL or pasted text) as a
 * backend job. Shared by Job Fit and the Screener. Keeps the input so going
 * Back does not lose it, and does not resubmit an unchanged posting.
 */
export function useJobPosting(mode: Mode) {
  const { jds, refreshAll } = useDashboardData();
  const [kind, setKind] = useState<PostingKind>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [jdId, setJdId] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const processedKey = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const value = kind === "url" ? url.trim() : text.trim();

  /** Why the current input cannot be submitted yet, or null. */
  const problem = (() => {
    if (!value) return null; // the button is disabled; no message needed
    if (kind === "url") {
      try {
        const u = new URL(value);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      } catch {
        return "That does not look like a web address. It should start with https://";
      }
    } else if (value.length > MAX_JD_CHARS) {
      return `That is ${value.length.toLocaleString()} characters. The limit is ${MAX_JD_CHARS.toLocaleString()}; trim it to the responsibilities and requirements.`;
    }
    return null;
  })();

  const canSubmit = !!value && !problem && !working;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setKind("url");
    setUrl("");
    setText("");
    setWorking(false);
    setSteps([]);
    setError(null);
    setJdId(null);
    setLabel(null);
    processedKey.current = null;
  }, []);

  /** Resolves with the posting's id once it is stored, or null if it failed. */
  const submit = useCallback(async (): Promise<string | null> => {
    if (!value || problem) return null;
    const key = `${kind}:${value}`;
    if (jdId && processedKey.current === key) return jdId;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setWorking(true);
    setError(null);
    setSteps([]);

    const accept = (id: string, jd: JobDescriptionOut | null) => {
      processedKey.current = key;
      setJdId(id);
      setLabel(postingLabel(jd ?? jds?.find((j) => j.id === id)));
      return id;
    };

    try {
      const body =
        kind === "url" ? { url: value, mode } : { text: value, mode };
      const { job_id } = await api.jobDescriptions.submit(body, controller.signal);
      const result = await waitForJob<JobDescriptionJobResult>(job_id, {
        onSteps: setSteps,
        signal: controller.signal,
      });
      refreshAll(); // the History previews read the posting list
      return accept(result.jd_id, result.job_description);
    } catch (err) {
      if (isAbortError(err)) return null;
      // The same posting was added before: use that one.
      const existing = isApiError(err, "DUPLICATE_JD") ? err.details?.jd_id : null;
      if (typeof existing === "string") {
        toast.info("You already added this posting. Using the copy you have.");
        return accept(existing, null);
      }
      setError(err);
      return null;
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
  }, [kind, value, problem, mode, jdId, jds, refreshAll]);

  return {
    kind,
    setKind,
    url,
    setUrl,
    text,
    setText,
    working,
    steps,
    error,
    errorMessage: error ? describeError(error, "The posting could not be added.") : null,
    problem,
    canSubmit,
    jdId,
    label,
    submit,
    reset,
  };
}

export type JobPostingState = ReturnType<typeof useJobPosting>;
