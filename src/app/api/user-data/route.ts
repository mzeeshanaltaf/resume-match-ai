import { auth } from "@clerk/nextjs/server";
import { getUserData } from "@/lib/n8n-data";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getUserData(userId);
  return Response.json(data);
}
