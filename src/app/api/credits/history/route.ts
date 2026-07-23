import { getUserId } from "@/lib/get-user";
import { getCreditHistory } from "@/lib/n8n-credits";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getCreditHistory(userId);
  return Response.json(history);
}
