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
  const resumes = Array.isArray(d?.resumes)
    ? d.resumes.filter((r: ResumeRecord) => !!r.file_id)
    : [];
  const jds = Array.isArray(d?.jds)
    ? d.jds.filter((r: JdRecord) => !!r.url_id)
    : [];

  // Build lookup maps so we can enrich match summaries with file_name / jd_url
  const resumeMap = new Map(resumes.map((r: ResumeRecord) => [r.file_id, r.file_name]));
  const jdMap = new Map(jds.map((j: JdRecord) => [j.url_id, j.jd_url]));

  const matches = Array.isArray(d?.job_match_summary)
    ? d.job_match_summary
        .filter((r: JobMatchSummary) => !!r.job_match_summary)
        .map((m: JobMatchSummary) => ({
          ...m,
          file_name: m.file_name || resumeMap.get(m.file_id) || undefined,
          jd_url: m.jd_url || jdMap.get(m.url_id) || undefined,
        }))
    : [];

  return {
    resumes,
    jds,
    job_match_summary: matches,
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
