import { getUserId } from "@/lib/get-user";
import { getRemainingCredits } from "@/lib/n8n-credits";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await getRemainingCredits(userId);

  // Normalize: n8n may return an array instead of a plain object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = Array.isArray(raw) ? (raw as any[])[0] : raw;
  const balance =
    typeof data?.current_balance === "number" ? data.current_balance : 0;

  return Response.json({ current_balance: balance });
}
