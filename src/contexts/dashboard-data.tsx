"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, isAbortError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type {
  CreditsOut,
  CreditTransaction,
  JobDescriptionOut,
  MatchListItem,
  OverviewOut,
  ResumeOut,
} from "@/lib/api/types";

/** Ledger rows kept in memory for the Credits tab. */
const LEDGER_LIMIT = 200;

interface DashboardDataContextType {
  overview: OverviewOut | null;
  matches: MatchListItem[] | null;
  resumes: ResumeOut[] | null;
  jds: JobDescriptionOut[] | null;
  /** Balance plus what each action costs (never hardcode prices in the UI). */
  credits: CreditsOut | null;
  creditBalance: number | null;
  creditHistory: CreditTransaction[] | null;
  loading: boolean;
  /** Set when the last load failed (data shown, if any, may be stale). */
  error: string | null;
  /** Everything: after a match, a screening, a delete. */
  refreshAll: () => Promise<void>;
  /** Balance and ledger only. */
  refreshCredits: () => Promise<void>;
  /** Show a just-uploaded resume immediately, before the next refetch. */
  addResume: (resume: ResumeOut) => void;
  /** Drop a deleted match from the lists immediately. */
  removeMatch: (id: string) => void;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<OverviewOut | null>(null);
  const [matches, setMatches] = useState<MatchListItem[] | null>(null);
  const [resumes, setResumes] = useState<ResumeOut[] | null>(null);
  const [jds, setJds] = useState<JobDescriptionOut[] | null>(null);
  const [credits, setCredits] = useState<CreditsOut | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshAll = useCallback(async () => {
    const results = await Promise.allSettled([
      api.overview(),
      api.credits(),
      api.creditTransactions(LEDGER_LIMIT),
      api.matches.list(),
      api.resumes.list(),
      api.jobDescriptions.list(),
    ]);
    if (!mounted.current) return;

    const [ov, cr, tx, ms, rs, js] = results;
    if (ov.status === "fulfilled") setOverview(ov.value);
    if (cr.status === "fulfilled") setCredits(cr.value);
    if (tx.status === "fulfilled") setCreditHistory(tx.value);
    if (ms.status === "fulfilled") setMatches(ms.value);
    if (rs.status === "fulfilled") setResumes(rs.value);
    if (js.status === "fulfilled") setJds(js.value);

    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected" && !isAbortError(r.reason)
    );
    setError(failed ? describeError(failed.reason, "Could not load your data.") : null);
    setLoading(false);
  }, []);

  const refreshCredits = useCallback(async () => {
    const [cr, tx] = await Promise.allSettled([
      api.credits(),
      api.creditTransactions(LEDGER_LIMIT),
    ]);
    if (!mounted.current) return;
    if (cr.status === "fulfilled") setCredits(cr.value);
    if (tx.status === "fulfilled") setCreditHistory(tx.value);
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const addResume = useCallback((resume: ResumeOut) => {
    setResumes((prev) => [resume, ...(prev ?? []).filter((r) => r.id !== resume.id)]);
  }, []);

  const removeMatch = useCallback((id: string) => {
    setMatches((prev) => prev?.filter((m) => m.id !== id) ?? prev);
  }, []);

  const value = useMemo<DashboardDataContextType>(
    () => ({
      overview,
      matches,
      resumes,
      jds,
      credits,
      creditBalance: credits?.balance ?? null,
      creditHistory,
      loading,
      error,
      refreshAll,
      refreshCredits,
      addResume,
      removeMatch,
    }),
    [
      overview,
      matches,
      resumes,
      jds,
      credits,
      creditHistory,
      loading,
      error,
      refreshAll,
      refreshCredits,
      addResume,
      removeMatch,
    ]
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx)
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  return ctx;
}
