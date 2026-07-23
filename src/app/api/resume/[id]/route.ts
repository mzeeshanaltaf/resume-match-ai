import { getUserId } from "@/lib/get-user";
import { deleteResume } from "@/lib/n8n-delete";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: fileId } = await params;
  const result = await deleteResume(userId, fileId);
  return Response.json(result);
}
