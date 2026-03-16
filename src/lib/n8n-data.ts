import { callN8nWebhook } from "./n8n";
import type {
  ResumeRecord,
  JdRecord,
  JobMatchSummary,
  UserDataResponse,
} from "@/types/n8n";

const USER_DATA_WEBHOOK_ID = "26dee7a9-19a0-4f65-af48-506384f50370";

/**
 * Single call to n8n that returns all user data:
 * resumes, jds, job_match_summary, remaining_credit, credit_history, user_analytics.
 */
export async function getUserData(userId: string): Promise<UserDataResponse> {
  const raw = await callN8nWebhook<UserDataResponse | UserDataResponse[]>(
    USER_DATA_WEBHOOK_ID,
    { event_type: "get_user_data", user_id: userId }
  );
  const d = Array.isArray(raw) ? raw[0] : raw;
  return {
    resumes: Array.isArray(d?.resumes)
      ? d.resumes.filter((r: ResumeRecord) => !!r.file_id)
      : [],
    jds: Array.isArray(d?.jds)
      ? d.jds.filter((r: JdRecord) => !!r.url_id)
      : [],
    job_match_summary: Array.isArray(d?.job_match_summary)
      ? d.job_match_summary.filter((r: JobMatchSummary) => !!r.job_match_summary)
      : [],
    remaining_credit: Number(d?.remaining_credit ?? 0),
    credit_history: Array.isArray(d?.credit_history) ? d.credit_history : [],
    user_analytics: {
      total_resume_processed: Number(d?.user_analytics?.total_resume_processed ?? 0),
      total_jds_processed: Number(d?.user_analytics?.total_jds_processed ?? 0),
      total_job_match_summary_processed: Number(d?.user_analytics?.total_job_match_summary_processed ?? 0),
    },
  };
}

// ─── Convenience wrappers (delegate to getUserData) ─────────────────────────

export async function getResumes(userId: string): Promise<ResumeRecord[]> {
  const data = await getUserData(userId);
  return data.resumes;
}

export async function getJds(userId: string): Promise<JdRecord[]> {
  const data = await getUserData(userId);
  return data.jds;
}

export async function getJobMatchSummary(userId: string): Promise<JobMatchSummary[]> {
  const data = await getUserData(userId);
  return data.job_match_summary;
}
