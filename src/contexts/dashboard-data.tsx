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
  CreditTransaction,
  ResumeRecord,
  JdRecord,
  UserDataResponse,
} from "@/types/n8n";

interface DashboardDataContextType {
  analytics: UserAnalyticsResponse | null;
  matches: JobMatchSummary[] | null;
  resumes: ResumeRecord[] | null;
  jds: JdRecord[] | null;
  creditBalance: number | null;
  creditHistory: CreditTransaction[] | null;
  loading: boolean;
  refreshAll: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(
  null
);

function applyUserData(
  data: UserDataResponse,
  setters: {
    setAnalytics: (v: UserAnalyticsResponse) => void;
    setMatches: (v: JobMatchSummary[]) => void;
    setResumes: (v: ResumeRecord[]) => void;
    setJds: (v: JdRecord[]) => void;
    setCreditBalance: (v: number) => void;
    setCreditHistory: (v: CreditTransaction[]) => void;
  }
) {
  setters.setAnalytics(data.user_analytics);
  setters.setMatches(Array.isArray(data.job_match_summary) ? data.job_match_summary : []);
  setters.setResumes(Array.isArray(data.resumes) ? data.resumes : []);
  setters.setJds(Array.isArray(data.jds) ? data.jds : []);
  setters.setCreditBalance(data.remaining_credit ?? 0);
  setters.setCreditHistory(Array.isArray(data.credit_history) ? data.credit_history : []);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [analytics, setAnalytics] = useState<UserAnalyticsResponse | null>(null);
  const [matches, setMatches] = useState<JobMatchSummary[] | null>(null);
  const [resumes, setResumes] = useState<ResumeRecord[] | null>(null);
  const [jds, setJds] = useState<JdRecord[] | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);

  const setters = { setAnalytics, setMatches, setResumes, setJds, setCreditBalance, setCreditHistory };

  // Initial fetch on mount (AbortController handles React 18 Strict Mode)
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function load() {
      try {
        const res = await fetch("/api/user-data", { signal });
        if (signal.aborted) return;
        if (res.ok) {
          const data: UserDataResponse = await res.json();
          applyUserData(data, setters);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New-user retry: if credits are still 0 after initial load, the signup
  // webhook may not have finished yet. Retry once after a short delay.
  useEffect(() => {
    if (loading || creditBalance === null || creditBalance > 0) return;

    const timer = setTimeout(() => {
      refreshAll();
    }, 3000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, creditBalance]);

  // Full refresh — called after Job Fit / Resume Screening / uploads complete
  const refreshAll = useCallback(async () => {
    try {
      const res = await fetch("/api/user-data");
      if (res.ok) {
        const data: UserDataResponse = await res.json();
        applyUserData(data, setters);
      }
    } catch {
      // fail silently
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardDataContext.Provider
      value={{
        analytics,
        matches,
        resumes,
        jds,
        creditBalance,
        creditHistory,
        loading,
        refreshAll,
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
