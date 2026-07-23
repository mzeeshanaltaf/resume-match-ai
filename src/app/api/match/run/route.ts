import { getUserId } from "@/lib/get-user";
import { runResumeMatch } from "@/lib/n8n-main";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { file_id, url_id, is_candidate } = await req.json();
  if (!file_id || !url_id) {
    return Response.json(
      { error: "file_id and url_id are required" },
      { status: 400 }
    );
  }

  const isCandidate = is_candidate !== false;
  const raw = await runResumeMatch(userId, file_id, url_id, isCandidate);
  // n8n may wrap response in an array
  const result = Array.isArray(raw) ? raw[0] : raw;
  return Response.json(result);
}
