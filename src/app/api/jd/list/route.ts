import { getUserId } from "@/lib/get-user";
import { getJds } from "@/lib/n8n-data";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jds = await getJds(userId);
  return Response.json(jds);
}
