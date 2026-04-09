import { auth } from "@clerk/nextjs/server";
import { scrapeJd } from "@/lib/n8n-main";
import { N8nError } from "@/lib/n8n";

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
  let result: any;
  try {
    result = await scrapeJd(userId, jdUrl, isCandidate, jd_text);
  } catch (err) {
    if (err instanceof N8nError) {
      // DUPLICATE_URL in non-2xx body — treat as success
      const body = err.body;
      const msg = body?.message ?? (Array.isArray(body) ? body[0]?.message : undefined);
      const urlId = body?.url_id ?? (Array.isArray(body) ? body[0]?.url_id : undefined);
      const jdUrlOut = body?.jd_url ?? (Array.isArray(body) ? body[0]?.jd_url : undefined);
      if (msg === "DUPLICATE_URL" && urlId) {
        return Response.json({ url_id: urlId, jd_url: jdUrlOut });
      }
    }
    return Response.json({ error: "Failed to process job description." }, { status: 422 });
  }

  // Unwrap array if needed
  while (Array.isArray(result)) {
    result = result[0];
  }

  // DUPLICATE_URL in 2xx body — treat as success
  if (result?.message === "DUPLICATE_URL" && result?.url_id) {
    return Response.json({ url_id: result.url_id, jd_url: result.jd_url });
  }

  return Response.json(result);
}
