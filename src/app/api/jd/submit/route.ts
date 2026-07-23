import { getUserId } from "@/lib/get-user";
import { scrapeJd } from "@/lib/n8n-main";
import { N8nError } from "@/lib/n8n";

export async function POST(req: Request) {
  const userId = await getUserId();
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
  let result: any;
  try {
    result = await scrapeJd(userId, jdUrl, isCandidate, jd_text);
  } catch (err) {
    if (err instanceof N8nError) {
      const body = Array.isArray(err.body) ? err.body[0] : err.body;
      if (body?.status === "DUPLICATE_URL") {
        const urlId = body?.details?.existing_url_id;
        const jdUrlOut = body?.details?.existing_url;
        if (urlId) return Response.json({ url_id: urlId, jd_url: jdUrlOut });
      }
    }
    return Response.json({ error: "Failed to process job description." }, { status: 422 });
  }

  // Unwrap array if needed
  while (Array.isArray(result)) {
    result = result[0];
  }

  // DUPLICATE_URL in 2xx body
  if (!result?.url_id && result?.status === "DUPLICATE_URL") {
    const urlId = result?.details?.existing_url_id;
    const jdUrlOut = result?.details?.existing_url;
    if (urlId) return Response.json({ url_id: urlId, jd_url: jdUrlOut });
  }

  return Response.json(result);
}
