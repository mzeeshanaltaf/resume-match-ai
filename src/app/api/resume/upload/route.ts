import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { processResume } from "@/lib/n8n-main";
import { getResumes } from "@/lib/n8n-data";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCandidate =
    req.nextUrl.searchParams.get("is_candidate") !== "false";

  const formData = await req.formData();
  const raw = await processResume(userId, formData, isCandidate);
  const result = Array.isArray(raw) ? raw[0] : raw;

  if (!result?.success) {
    return Response.json(
      { error: result?.message ?? "Resume processing failed." },
      { status: 422 }
    );
  }

  // n8n doesn't return file_id — fetch the updated resume list to find it
  const resumes = await getResumes(userId);
  const newest = resumes[0];

  if (!newest) {
    return Response.json(
      { error: "Resume processed but could not be retrieved." },
      { status: 500 }
    );
  }

  return Response.json({
    file_id: newest.file_id,
    file_name: newest.file_name,
  });
}
