"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";
import { cn } from "@/lib/utils";

/** The balance, always in view, linking to the ledger. Red only when it is empty. */
export function CreditDisplay() {
  const { creditBalance, loading } = useDashboardData();

  if (creditBalance === null) {
    return loading ? <Skeleton className="h-5 w-16" /> : null;
  }

  return (
    <Link
      href="/dashboard/settings?tab=credits"
      className="flex min-h-11 items-baseline gap-1.5 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
      aria-label={`${creditBalance} ${creditBalance === 1 ? "credit" : "credits"} left. Open your credit history.`}
    >
      <span className={cn("text-base font-bold tabular-nums", creditBalance === 0 && "text-pencil")}>
        {creditBalance}
      </span>
      <span className="text-muted-foreground">{creditBalance === 1 ? "credit" : "credits"}</span>
    </Link>
  );
}
