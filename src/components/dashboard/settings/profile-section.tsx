"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient, useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPassword } from "./use-has-password";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProfileSection() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const hasPassword = useHasPassword();

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
      toast.error(error.message ?? "Your name could not be saved.");
      return;
    }
    toast.success("Name saved.");
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
      toast.error(error.message ?? "Your password could not be changed.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success("Password changed. Other devices were signed out.");
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (isPending) {
    return (
      <div className="max-w-lg space-y-6" aria-busy="true" aria-label="Loading your profile">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-10">
      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Profile
        </h2>
        <form onSubmit={handleUpdateName} className="mt-4 space-y-4">
          <Field id="profile-email" label="Email" hint="This is how you sign in. It cannot be changed here.">
            <Input id="profile-email" value={email} disabled readOnly />
          </Field>
          <Field id="profile-name" label="Name">
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              autoComplete="name"
            />
          </Field>
          <Button type="submit" disabled={savingName || !name.trim() || name.trim() === session?.user.name}>
            {savingName && <Loader2 className="animate-spin" />}
            Save name
          </Button>
        </form>
      </section>

      {hasPassword !== false && (
        <section aria-labelledby="password-heading" className="border-t border-border pt-8">
          <h2 id="password-heading" className="text-lg font-semibold">
            Password
          </h2>
          <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
            <Field id="current-password" label="Current password">
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field id="new-password" label="New password" hint="At least 8 characters.">
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Button
              type="submit"
              variant="outline"
              disabled={savingPassword || !currentPassword || newPassword.length < 8}
            >
              {savingPassword && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </form>
        </section>
      )}

      <section aria-labelledby="session-heading" className="border-t border-border pt-8">
        <h2 id="session-heading" className="text-lg font-semibold">
          This device
        </h2>
        <p className="mt-1 text-base text-muted-foreground">Sign out of ResuMatchAI on this browser.</p>
        <Button variant="outline" className="mt-4" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          Sign out
        </Button>
      </section>
    </div>
  );
}
