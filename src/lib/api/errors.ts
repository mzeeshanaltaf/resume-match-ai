import { ApiError, isAbortError } from "./client";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

const SCRAPE_HINT = "Try again, or choose \"Paste text\" and paste the posting instead.";

/**
 * Message for a failed request or job. The backend's own `message` is already
 * specific for most codes (e.g. what an invalid document looks like), so this
 * only overrides codes where the UI can say something more useful.
 */
export function describeError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isAbortError(err)) return "Cancelled.";
  if (!(err instanceof ApiError)) return fallback;

  const d = err.details ?? {};
  switch (err.code) {
    case "INSUFFICIENT_CREDITS": {
      const needed = num(d.needed);
      const balance = num(d.balance);
      if (needed !== null && balance !== null) {
        return `You need ${plural(needed, "credit")} for this but have ${balance}.`;
      }
      return "You don't have enough credits for this.";
    }
    case "AUTH_REQUIRED":
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "Your session has expired. Please sign in again.";
    case "AUTH_UNAVAILABLE":
      return "Sign-in could not be verified right now. Please try again in a moment.";
    case "NETWORK_ERROR":
    case "API_NOT_CONFIGURED":
      return err.message;

    // Jobs that stopped for infrastructure reasons: nothing the user did wrong.
    case "JOB_INTERRUPTED":
      return "This was interrupted by a server restart. Any credit was refunded. Please try again.";
    case "LLM_TIMEOUT":
    case "LLM_UNAVAILABLE":
    case "LLM_BAD_OUTPUT":
    case "LLM_ERROR":
    case "LLM_NOT_CONFIGURED":
      return "The AI service could not finish this. Any credit was refunded. Please try again in a moment.";
    case "SOURCE_DELETED":
      return "The resume or job description was deleted while this was running. Any credit was refunded.";
    case "SCREENING_FAILED":
      return "None of the resumes could be scored. Your credits were refunded.";

    // Job posting could not be fetched.
    case "SCRAPE_FAILED":
    case "SCRAPE_TIMEOUT":
    case "SCRAPE_BUSY":
    case "SCRAPE_UNAVAILABLE":
    case "SCRAPING_NOT_CONFIGURED":
      return `We couldn't load that job posting. ${SCRAPE_HINT}`;
    case "SCRAPE_EMPTY":
      return `That page had no readable text. ${SCRAPE_HINT}`;

    // Limits.
    case "RESUME_LIMIT_REACHED":
      return "You've reached the limit of stored resumes. Delete one to add another.";
    case "TOO_MANY_RESUMES": {
      const max = num(d.max_resumes);
      return max !== null
        ? `You can screen up to ${plural(max, "resume")} at a time.`
        : err.message;
    }
    case "MODE_MISMATCH":
      return "That resume and job description were added for different tools (Job Fit vs Resume Screener). Add them again from the same one.";
    case "NOT_FOUND":
      return "That item no longer exists. It may have been deleted.";
    case "EXPORT_RATE_LIMITED": {
      const s = num(d.retry_after_seconds);
      return s !== null
        ? `You can export your data once an hour. Try again in ${Math.max(1, Math.ceil(s / 60))} min.`
        : err.message;
    }
    default:
      return err.message || fallback;
  }
}
