import { callN8nWebhook } from "./n8n";
import type {
  ResumeRecord,
  JdRecord,
  JobMatchSummary,
  UserDataResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DATA_WEBHOOK_ID!;
const USER_DATA_WEBHOOK_ID = "26dee7a9-19a0-4f65-af48-506384f50370";

/**
 * Fetch unified user data (resumes, JDs, matches, credits, analytics) in a single call.
 * This consolidates what was previously 7 separate webhook calls.
 */
export async function getUserData(
  userId: string
): Promise<UserDataResponse> {
  const raw = await callN8nWebhook<UserDataResponse | UserDataResponse[]>(
    USER_DATA_WEBHOOK_ID,
    {
      event_type: "get_user_data",
      user_id: userId,
    }
  );

  // n8n may return an array, normalize to object
  const data = Array.isArray(raw) ? raw[0] : raw;

  return {
    resumes: Array.isArray(data?.resumes) ? data.resumes : [],
    jds: Array.isArray(data?.jds) ? data.jds : [],
    job_match_summary: Array.isArray(data?.job_match_summary)
      ? data.job_match_summary
      : [],
    remaining_credit: Number(data?.remaining_credit ?? 0),
    credit_history: Array.isArray(data?.credit_history)
      ? data.credit_history
      : [],
    user_analytics: data?.user_analytics ?? {
      total_resume_processed: 0,
      total_jds_processed: 0,
      total_job_match_summary_processed: 0,
    },
  };
}

export async function getResumes(
  userId: string,
  isCandidate: boolean
): Promise<ResumeRecord[]> {
  const data = await callN8nWebhook<ResumeRecord[] | Record<string, unknown>>(
    WEBHOOK_ID,
    { event_type: "get_resume", user_id: userId, is_candidate: isCandidate }
  );
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((r): r is ResumeRecord => !!r.file_id);
}

export async function getJds(
  userId: string,
  isCandidate: boolean
): Promise<JdRecord[]> {
  const data = await callN8nWebhook<JdRecord[] | Record<string, unknown>>(
    WEBHOOK_ID,
    { event_type: "get_jds", user_id: userId, is_candidate: isCandidate }
  );
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((r): r is JdRecord => !!r.url_id);
}

export async function getJobMatchSummary(
  userId: string
): Promise<JobMatchSummary[]> {
  const data = await callN8nWebhook<
    JobMatchSummary[] | Record<string, unknown>
  >(WEBHOOK_ID, { event_type: "get_job_match_summary", user_id: userId });
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((r): r is JobMatchSummary => !!r.job_match_summary);
}
