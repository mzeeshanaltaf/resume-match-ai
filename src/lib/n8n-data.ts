import { callN8nWebhook } from "./n8n";
import type { ResumeRecord, JdRecord, JobMatchSummary } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DATA_WEBHOOK_ID!;

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
