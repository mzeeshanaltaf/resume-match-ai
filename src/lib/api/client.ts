/**
 * Typed client for the FastAPI backend. Browser-only: it attaches a Better Auth
 * JWT (see `getApiToken`) and talks to `NEXT_PUBLIC_API_URL` directly.
 *
 * Long work (uploads, JD processing, matching, screening) answers `202 {job_id}`;
 * `waitForJob` follows the job over SSE and resolves with its result.
 */
import { clearApiToken, getApiToken } from "@/lib/auth-client";
import type {
  ApiErrorBody,
  CreditsOut,
  CreditTransaction,
  DocumentJobResult,
  JobAccepted,
  JobDescriptionCreate,
  JobDescriptionJobResult,
  JobDescriptionOut,
  JobOut,
  JobStep,
  MatchJobResult,
  MatchOut,
  MatchListItem,
  Mode,
  OverviewOut,
  ResumeJobResult,
  ResumeOut,
  ScreeningResult,
} from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// ─── Errors ─────────────────────────────────────────────────────────────────

/** A failed request, or a failed job. `status` is 0 when there was no HTTP response. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function toApiError(status: number, body: unknown): ApiError {
  const b = body as Partial<ApiErrorBody> | null;
  if (b && typeof b.code === "string" && typeof b.message === "string") {
    return new ApiError(status, b.code, b.message, b.details ?? null);
  }
  return new ApiError(
    status,
    `HTTP_${status}`,
    status >= 500
      ? "The server had a problem. Please try again in a moment."
      : "The request could not be completed."
  );
}

// ─── Transport ──────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const AUTH_RETRY_CODES = new Set(["AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED"]);

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function send(
  path: string,
  opts: RequestOptions,
  forceRefresh: boolean
): Promise<Response> {
  if (!API_URL) {
    throw new ApiError(0, "API_NOT_CONFIGURED", "NEXT_PUBLIC_API_URL is not set.");
  }
  const token = await getApiToken(forceRefresh);
  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }

  const headers: Record<string, string> = {
    ...opts.headers,
    Authorization: `Bearer ${token}`,
  };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // fetch sets the multipart boundary itself
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again."
    );
  }
}

/** Performs the request, refreshing the token once if the backend rejects it. */
async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts, false);
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => null);
    if (AUTH_RETRY_CODES.has(body?.code)) {
      clearApiToken();
      res = await send(path, opts, true);
    }
  }
  if (!res.ok) {
    throw toApiError(res.status, await res.json().catch(() => null));
  }
  return res;
}

async function json<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function list<T>(
  path: string,
  query?: RequestOptions["query"],
  signal?: AbortSignal
): Promise<{ items: T[]; total: number }> {
  const res = await request(path, { query, signal });
  const items = (await res.json()) as T[];
  const total = Number(res.headers.get("X-Total-Count"));
  return { items, total: Number.isFinite(total) && total > 0 ? total : items.length };
}

// ─── Jobs: SSE with a polling fallback ──────────────────────────────────────

type SseMessage = { event: string; data: string };

/** Splits an SSE byte stream into messages (handles chunk boundaries, CRLF, comments). */
async function* readSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          // `id:` and `: keepalive` comment lines carry nothing we need
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    // Returning on the terminal event must close the connection, not just drop our lock on it.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Insert or update a step by name, keeping first-seen order. */
export function upsertStep(steps: JobStep[], step: JobStep): JobStep[] {
  const i = steps.findIndex((s) => s.name === step.name);
  if (i === -1) return [...steps, step];
  const next = steps.slice();
  next[i] = step;
  return next;
}

type WaitOptions = {
  /** Called with the full step list every time it changes. */
  onSteps?: (steps: JobStep[]) => void;
  signal?: AbortSignal;
};

const POLL_INTERVAL_MS = 1500;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Terminal outcome of a job, or null if the stream ended before one arrived. */
async function followEvents<T>(
  jobId: string,
  opts: WaitOptions
): Promise<{ result: T } | null> {
  const res = await request(`/v1/jobs/${encodeURIComponent(jobId)}/events`, {
    headers: { Accept: "text/event-stream" },
    signal: opts.signal,
  });
  if (!res.body) return null;

  let steps: JobStep[] = [];
  for await (const msg of readSse(res.body)) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(msg.data);
    } catch {
      continue; // ignore a malformed frame rather than fail the whole job
    }
    if (msg.event === "step") {
      steps = upsertStep(steps, payload as unknown as JobStep);
      opts.onSteps?.(steps);
    } else if (msg.event === "succeeded") {
      return { result: payload.result as T };
    } else if (msg.event === "failed") {
      const e = payload.error as ApiErrorBody | undefined;
      throw new ApiError(
        0,
        e?.code ?? "JOB_FAILED",
        e?.message ?? "The job failed.",
        e?.details ?? null
      );
    }
  }
  return null;
}

/** Polls the job snapshot until it finishes (used if the event stream drops). */
async function pollJob<T>(jobId: string, opts: WaitOptions): Promise<T> {
  for (;;) {
    const job = await api.jobs.get(jobId, opts.signal);
    opts.onSteps?.(job.steps);
    if (job.status === "succeeded") return job.result as T;
    if (job.status === "failed") {
      const e = job.error;
      throw new ApiError(
        0,
        e?.code ?? "JOB_FAILED",
        e?.message ?? "The job failed.",
        e?.details ?? null
      );
    }
    await sleep(POLL_INTERVAL_MS, opts.signal);
  }
}

/**
 * Follows a job to completion and resolves with its `result`. Rejects with the
 * job's `{code, message, details}` as an `ApiError`. Uses the SSE stream (a
 * connection always replays the full history first); if the stream cannot be
 * held open, falls back to polling the snapshot.
 */
export async function waitForJob<T>(jobId: string, opts: WaitOptions = {}): Promise<T> {
  try {
    const done = await followEvents<T>(jobId, opts);
    if (done) return done.result;
  } catch (err) {
    // A real answer (job failed, 404, auth) is final; only transport trouble falls back.
    if (isAbortError(err)) throw err;
    if (err instanceof ApiError && err.code !== "NETWORK_ERROR") throw err;
  }
  return pollJob<T>(jobId, opts);
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export const api = {
  overview: (signal?: AbortSignal) => json<OverviewOut>("/v1/overview", { signal }),

  credits: (signal?: AbortSignal) => json<CreditsOut>("/v1/credits", { signal }),
  creditTransactions: (limit?: number, signal?: AbortSignal) =>
    list<CreditTransaction>(
      "/v1/credits/transactions",
      limit ? { limit } : undefined,
      signal
    ).then((r) => r.items),

  resumes: {
    list: (signal?: AbortSignal) =>
      json<ResumeOut[]>("/v1/resumes", { signal }),
    upload: (file: File, mode: Mode, signal?: AbortSignal) => {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      return json<JobAccepted>("/v1/resumes", { method: "POST", form, signal });
    },
    remove: (id: string) =>
      json<void>(`/v1/resumes/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** The original file, streamed through the API (never a public URL). */
    file: async (id: string, signal?: AbortSignal): Promise<Blob> => {
      const res = await request(`/v1/resumes/${encodeURIComponent(id)}/file`, { signal });
      return res.blob();
    },
  },

  jobDescriptions: {
    list: (signal?: AbortSignal) =>
      // 500 is the API's maximum page size; the default (100) would silently cap the list.
      list<JobDescriptionOut>("/v1/job-descriptions", { limit: 500 }, signal).then(
        (r) => r.items
      ),
    submit: (body: JobDescriptionCreate, signal?: AbortSignal) =>
      json<JobAccepted>("/v1/job-descriptions", { method: "POST", json: body, signal }),
    remove: (id: string) =>
      json<void>(`/v1/job-descriptions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  matches: {
    list: (signal?: AbortSignal) =>
      list<MatchListItem>("/v1/matches", undefined, signal).then((r) => r.items),
    get: (id: string, signal?: AbortSignal) =>
      json<MatchOut>(`/v1/matches/${encodeURIComponent(id)}`, { signal }),
    create: (resumeId: string, jdId: string, signal?: AbortSignal) =>
      json<JobAccepted>("/v1/matches", {
        method: "POST",
        json: { resume_id: resumeId, jd_id: jdId },
        signal,
      }),
    /** Deletes only the match; its resume and job description stay. */
    remove: (id: string) =>
      json<void>(`/v1/matches/${encodeURIComponent(id)}`, { method: "DELETE" }),
    tailoredBullets: (id: string) =>
      json<JobAccepted>(`/v1/matches/${encodeURIComponent(id)}/tailored-bullets`, {
        method: "POST",
      }),
    coverLetter: (id: string) =>
      json<JobAccepted>(`/v1/matches/${encodeURIComponent(id)}/cover-letter`, {
        method: "POST",
      }),
  },

  screenings: {
    create: (resumeIds: string[], jdId: string, signal?: AbortSignal) =>
      json<JobAccepted>("/v1/screenings", {
        method: "POST",
        json: { resume_ids: resumeIds, jd_id: jdId },
        signal,
      }),
  },

  jobs: {
    get: (id: string, signal?: AbortSignal) =>
      json<JobOut>(`/v1/jobs/${encodeURIComponent(id)}`, { signal }),
  },

  account: {
    /**
     * Everything the user owns as a ZIP. Needs the Authorization header, so it is
     * fetched as a blob (a plain link cannot send it). One export per hour: a
     * second one answers 429 `EXPORT_RATE_LIMITED` with `details.retry_after_seconds`.
     */
    export: async (
      signal?: AbortSignal
    ): Promise<{ blob: Blob; fileName: string }> => {
      const res = await request("/v1/account/export", { signal });
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      return { blob, fileName: match?.[1] ?? "resumatch-export.zip" };
    },
  },
};

// Result types for `waitForJob<...>`, re-exported so callers import from one place.
export type {
  DocumentJobResult,
  JobDescriptionJobResult,
  MatchJobResult,
  ResumeJobResult,
  ScreeningResult,
};
