import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { processResume } from "@/lib/n8n-main";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCandidate =
    req.nextUrl.searchParams.get("is_candidate") !== "false";

  const formData = await req.formData();
  const raw = await processResume(userId, formData, isCandidate);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = Array.isArray(raw) ? raw[0] : raw;

  if (!result?.success) {
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
