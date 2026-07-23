import { getUserId } from "@/lib/get-user";
import { getResumes } from "@/lib/n8n-data";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resumes = await getResumes(userId);
  return Response.json(resumes);
}
