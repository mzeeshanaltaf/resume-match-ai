"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient, useSession, signOut } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2, LogOut } from "lucide-react";

export function ProfileSection() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);

  const email = session?.user.email ?? "";

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSavingName(false);
    if (error) {
      toast.error(error.message ?? "Failed to update name.");
      return;
    }
    toast.success("Profile updated.");
    router.refresh();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message ?? "Failed to change password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success("Password changed.");
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="profile-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="profile-email" value={email} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isPending}
                maxLength={60}
              />
            </div>
            <Button
              type="submit"
              disabled={savingName || isPending || !name.trim()}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="current-password" className="text-sm font-medium">
                Current password
              </label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={savingPassword || !currentPassword || newPassword.length < 8}
              className="gap-2"
            >
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>

          <Separator className="my-6" />

          <Button
            variant="ghost"
            onClick={handleSignOut}
            disabled={signingOut}
            className="gap-2 text-muted-foreground"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
