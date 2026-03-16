import { auth } from "@clerk/nextjs/server";
import { getUserData } from "@/lib/n8n-data";
import type { UserDataResponse } from "@/types/n8n";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userData = await getUserData(userId);

  // Return response matching the expected structure
  const response: {
    resumes: typeof userData.resumes;
    jds: typeof userData.jds;
    job_match_summary: typeof userData.job_match_summary;
    remaining_credit: number;
    credit_history: typeof userData.credit_history;
    user_analytics: typeof userData.user_analytics;
  } = {
    resumes: userData.resumes,
    jds: userData.jds,
    job_match_summary: userData.job_match_summary,
    remaining_credit: userData.remaining_credit,
    credit_history: userData.credit_history,
    user_analytics: userData.user_analytics,
  };

  return Response.json(response);
}
