"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSection } from "./account-section";
import { CreditsSection } from "./credits-section";
import { ProfileSection } from "./profile-section";
import type { SettingsTabId } from "./tab-ids";

/**
 * `initialTab` comes from `?tab=` read on the server, so the first client render
 * matches the server HTML. The credit balance in the top bar links to
 * `?tab=credits` even while the user is already here, so follow later changes.
 */
export function SettingsTabs({ initialTab }: { initialTab: SettingsTabId }) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTabId)}>
      <TabsList variant="line" aria-label="Settings sections">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="credits">Credits</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="mt-8">
        <ProfileSection />
      </TabsContent>
      <TabsContent value="credits" className="mt-8">
        <CreditsSection />
      </TabsContent>
      <TabsContent value="account" className="mt-8">
        <AccountSection />
      </TabsContent>
    </Tabs>
  );
}
