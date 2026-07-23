import { getUserId } from "@/lib/get-user";
import { deleteJobMatchSummary } from "@/lib/n8n-delete";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // [id] = file_id; url_id comes from the request body
  const { id: fileId } = await params;
  const { url_id } = await req.json();

  if (!url_id) {
    return Response.json({ error: "url_id is required" }, { status: 400 });
  }

  const result = await deleteJobMatchSummary(userId, fileId, url_id);
  return Response.json(result);
}
