import { getUserId } from "@/lib/get-user";
import { getUserAnalytics } from "@/lib/n8n-analytics";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const analytics = await getUserAnalytics(userId);
  return Response.json(analytics);
}
