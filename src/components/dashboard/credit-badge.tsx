import { getUserId } from "@/lib/get-user";
import { getUserData } from "@/lib/n8n-data";
import { Zap } from "lucide-react";

export async function CreditBadge() {
  const userId = await getUserId();
  if (!userId) return null;

  let balance = 0;
  try {
    const data = await getUserData(userId);
    balance = data.remaining_credit;
  } catch {
    // n8n unavailable — show 0 gracefully
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
      <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="text-xs font-medium">
        <span className="text-foreground">{balance}</span>
        <span className="ml-1 text-muted-foreground">credits left</span>
      </span>
    </div>
  );
}
