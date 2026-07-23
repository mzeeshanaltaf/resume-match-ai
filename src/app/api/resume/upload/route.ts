import { getUserId } from "@/lib/get-user";
import { NextRequest } from "next/server";
import { processResume } from "@/lib/n8n-main";
import { N8nError } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCandidate =
    req.nextUrl.searchParams.get("is_candidate") !== "false";

  const formData = await req.formData();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  try {
    result = await processResume(userId, formData, isCandidate);
  } catch (err) {
    if (err instanceof N8nError) {
      const body = Array.isArray(err.body) ? err.body[0] : err.body;
      if (body?.status === "DUPLICATE_DOCUMENT") {
        const fileId = body?.details?.existing_document_file_id;
        const fileName = body?.details?.existing_document_name ?? "";
        if (fileId) return Response.json({ file_id: fileId, file_name: fileName });
      }
    }
    return Response.json({ error: "Resume processing failed." }, { status: 422 });
  }

  // n8n may wrap the response in one or more array layers — unwrap to plain object
  while (Array.isArray(result)) {
    result = result[0];
  }

  if (!result?.success) {
    // DUPLICATE_DOCUMENT in 2xx body
    if (result?.status === "DUPLICATE_DOCUMENT") {
      const fileId = result?.details?.existing_document_file_id;
      const fileName = result?.details?.existing_document_name ?? "";
      if (fileId) return Response.json({ file_id: fileId, file_name: fileName });
    }
    return Response.json(
      { error: result?.message ?? "Resume processing failed." },
      { status: 422 }
    );
  }

  if (!result.file_id) {
    return Response.json(
      { error: "Resume processed but no file ID was returned." },
      { status: 500 }
    );
  }

  return Response.json({
    file_id: result.file_id,
    file_name: result.file_name ?? "",
  });
}
