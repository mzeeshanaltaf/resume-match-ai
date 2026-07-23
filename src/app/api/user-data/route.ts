import { getUserId } from "@/lib/get-user";
import { getUserData } from "@/lib/n8n-data";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getUserData(userId);
  return Response.json(data);
}
