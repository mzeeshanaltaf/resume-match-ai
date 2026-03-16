import { getUserData } from "./n8n-data";
import type { UserAnalyticsResponse } from "@/types/n8n";

export async function getUserAnalytics(
  userId: string
): Promise<UserAnalyticsResponse> {
  const data = await getUserData(userId);
  return data.user_analytics;
}
