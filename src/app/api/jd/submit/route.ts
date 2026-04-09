import { auth } from "@clerk/nextjs/server";
import { scrapeJd } from "@/lib/n8n-main";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, jd_text, is_candidate } = await req.json();
  if ((!url || typeof url !== "string") && (!jd_text || typeof jd_text !== "string")) {
    return Response.json({ error: "url or jd_text is required" }, { status: 400 });
  }

  const isCandidate = is_candidate !== false;
  const jdUrl = url && typeof url === "string" ? url : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await scrapeJd(userId, jdUrl, isCandidate, jd_text);

  // DUPLICATE_URL: n8n already has this JD — return the existing url_id as success
  if (result?.message === "DUPLICATE_URL" && result?.url_id) {
    return Response.json({ url_id: result.url_id, jd_url: result.jd_url });
  }

  return Response.json(result);
}
