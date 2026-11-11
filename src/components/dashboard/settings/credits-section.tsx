"use client";

import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CreditsSection() {
  const { creditBalance, creditHistory, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full max-w-sm rounded-lg" />
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-5 max-w-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
          <Zap className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Available credits</p>
          <p className="text-3xl font-bold">{creditBalance ?? 0}</p>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Transaction History</h3>
        {!creditHistory || creditHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {creditHistory.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">
                    {tx.description || tx.name_snapshot || tx.transaction_type.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    tx.credits_delta >= 0
                      ? "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : "border-red-300 dark:border-red-800 text-red-700 dark:text-red-400"
                  }
                >
                  {tx.credits_delta >= 0 ? "+" : ""}
                  {tx.credits_delta}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
