"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditsSection } from "@/components/dashboard/settings/credits-section";
import { ProfileSection } from "@/components/dashboard/settings/profile-section";
import { AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, profile, and credits.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-6">
          <ProfileSection />
        </TabsContent>

        {/* Credits */}
        <TabsContent value="credits" className="mt-6">
          <CreditsSection />
        </TabsContent>

        {/* Account / Danger zone */}
        <TabsContent value="account" className="mt-6">
          <div className="max-w-lg space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Account deletion and data export features are coming soon.
                    Contact support if you need help.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
