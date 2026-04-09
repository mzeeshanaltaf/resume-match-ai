import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { processResume } from "@/lib/n8n-main";
import { N8nError } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
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
      // DUPLICATE_DOCUMENT in non-2xx body — treat as success
      const body = err.body;
      const msg = body?.message ?? (Array.isArray(body) ? body[0]?.message : undefined);
      const fileId = body?.file_id ?? (Array.isArray(body) ? body[0]?.file_id : undefined);
      const fileName = body?.file_name ?? (Array.isArray(body) ? body[0]?.file_name : undefined);
      if (msg === "DUPLICATE_DOCUMENT" && fileId) {
        return Response.json({ file_id: fileId, file_name: fileName ?? "" });
      }
    }
    return Response.json({ error: "Resume processing failed." }, { status: 422 });
  }

  // n8n may wrap the response in one or more array layers — unwrap to plain object
  while (Array.isArray(result)) {
    result = result[0];
  }

  if (!result?.success) {
    // DUPLICATE_DOCUMENT in 2xx body — treat as success
    const msg = result?.message;
    if (msg === "DUPLICATE_DOCUMENT" && result?.file_id) {
      return Response.json({
        file_id: result.file_id,
        file_name: result.file_name ?? "",
      });
    }
    return Response.json(
      { error: msg ?? "Resume processing failed." },
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
