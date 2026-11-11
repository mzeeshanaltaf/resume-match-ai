import type { Metadata } from "next";
import { ReportPage, type ReportTabId } from "@/components/dashboard/report/report-page";

export const metadata: Metadata = { title: "Report" };

const TABS: Record<string, ReportTabId> = {
  bullets: "bullets",
  letter: "letter",
};

export default async function ReportRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <ReportPage id={id} initialTab={TABS[tab ?? ""] ?? "analysis"} />;
}
