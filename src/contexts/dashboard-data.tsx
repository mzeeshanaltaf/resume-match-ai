"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  UserAnalyticsResponse,
  JobMatchSummary,
  CreditBalanceResponse,
  CreditTransaction,
  CreditHistoryResponse,
} from "@/types/n8n";

interface DashboardDataContextType {
  analytics: UserAnalyticsResponse | null;
  matches: JobMatchSummary[] | null;
  creditBalance: number | null;
  creditHistory: CreditTransaction[] | null;
  loading: boolean;
  refreshAll: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(
  null
);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [analytics, setAnalytics] = useState<UserAnalyticsResponse | null>(
    null
  );
  const [matches, setMatches] = useState<JobMatchSummary[] | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  // Initial fetch on mount (AbortController handles React 18 Strict Mode)
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function load() {
      try {
        const [analyticsRes, matchesRes, balanceRes, historyRes] =
          await Promise.all([
            fetch("/api/analytics", { signal }),
            fetch("/api/match/history", { signal }),
            fetch("/api/credits/balance", { signal }),
            fetch("/api/credits/history", { signal }),
          ]);

        if (signal.aborted) return;

        if (analyticsRes.ok) {
          setAnalytics(await analyticsRes.json());
        }
        if (matchesRes.ok) {
          const d = await matchesRes.json();
          setMatches(Array.isArray(d) ? d : []);
        }
        if (balanceRes.ok) {
          const d: CreditBalanceResponse = await balanceRes.json();
          setCreditBalance(d.current_balance ?? 0);
        }
        if (historyRes.ok) {
          const d: CreditHistoryResponse = await historyRes.json();
          setCreditHistory(Array.isArray(d) ? d : []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  // Full refresh — called after Job Fit / Resume Screening completes
  const refreshAll = useCallback(async () => {
    try {
      const [analyticsRes, matchesRes, balanceRes, historyRes] =
        await Promise.all([
          fetch("/api/analytics"),
          fetch("/api/match/history"),
          fetch("/api/credits/balance"),
          fetch("/api/credits/history"),
        ]);

      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (matchesRes.ok) {
        const d = await matchesRes.json();
        setMatches(Array.isArray(d) ? d : []);
      }
      if (balanceRes.ok) {
        const d: CreditBalanceResponse = await balanceRes.json();
        setCreditBalance(d.current_balance ?? 0);
      }
      if (historyRes.ok) {
        const d: CreditHistoryResponse = await historyRes.json();
        setCreditHistory(Array.isArray(d) ? d : []);
      }
    } catch {
      // fail silently
    }
  }, []);

  // Lightweight credit-only refresh — called after credit-consuming actions
  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (res.ok) {
        const d: CreditBalanceResponse = await res.json();
        setCreditBalance(d.current_balance ?? 0);
      }
    } catch {
      // fail silently
    }
  }, []);

  return (
    <DashboardDataContext.Provider
      value={{
        analytics,
        matches,
        creditBalance,
        creditHistory,
        loading,
        refreshAll,
        refreshCredits,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx)
    throw new Error(
      "useDashboardData must be used within DashboardDataProvider"
    );
  return ctx;
}
