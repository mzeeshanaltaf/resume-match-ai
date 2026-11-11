import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsTabs } from "@/components/dashboard/settings/settings-tabs";
import { SETTINGS_TABS } from "@/components/dashboard/settings/tab-ids";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = SETTINGS_TABS.find((t) => t === tab) ?? "profile";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Settings" description="Your profile, your credits, and your data." />
      <SettingsTabs initialTab={initialTab} />
    </div>
  );
}
