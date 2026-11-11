"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, clearApiToken, signOut, useSession } from "@/lib/auth-client";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { ErrorNote } from "@/components/dashboard/notes";
import { useHasPassword } from "./use-has-password";

export function AccountSection() {
  return (
    <div className="max-w-xl space-y-10">
      <ExportData />
      <DeleteAccount />
    </div>
  );
}

/* ─── Download my data ───────────────────────────────────────────────────── */

function ExportData() {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  async function download() {
    setWorking(true);
    setError(null);
    setDone(null);
    try {
      const { blob, fileName } = await api.account.export();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(fileName);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading" className="text-lg font-semibold">
        Download my data
      </h2>
      <p className="mt-1 text-base text-muted-foreground">
        A ZIP with everything we hold about you: your original resume files, job postings,
        reports, tailored bullets, cover letters and credit history, as files you can open.
        You can download it once an hour.
      </p>
      <Button className="mt-4" variant="outline" onClick={download} disabled={working}>
        {working ? <Loader2 className="animate-spin" /> : <Download />}
        {working ? "Preparing your ZIP" : "Download my data"}
      </Button>
      <div aria-live="polite" className="mt-3">
        {done && (
          <p className="text-sm text-muted-foreground">
            Saved as <span className="font-semibold text-foreground">{done}</span>. It includes a
            README that explains each file.
          </p>
        )}
        {error != null && (
          <ErrorNote title="Your data was not downloaded">
            {describeError(error, "The export could not be created. Please try again.")}
          </ErrorNote>
        )}
      </div>
    </section>
  );
}

/* ─── Delete account ─────────────────────────────────────────────────────── */

function DeleteAccount() {
  const router = useRouter();
  const { data: session } = useSession();
  const hasPassword = useHasPassword();
  const emailId = useId();
  const passwordId = useId();

  const [open, setOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ message: string; staleSession: boolean } | null>(null);

  const email = session?.user.email ?? "";
  const emailMatches = !!email && typedEmail.trim().toLowerCase() === email.toLowerCase();
  const ready = emailMatches && (hasPassword === false || password.length > 0) && hasPassword !== null;

  function close() {
    setOpen(false);
    setTypedEmail("");
    setPassword("");
    setError(null);
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setWorking(true);
    setError(null);
    // Better Auth first asks our backend to erase everything; if that fails it
    // refuses, and nothing at all has been deleted.
    const { error: failure } = await authClient.deleteUser(hasPassword ? { password } : {});
    if (failure) {
      setWorking(false);
      const code = String(failure.code ?? "");
      setError({
        staleSession: code === "SESSION_EXPIRED",
        message:
          code === "INVALID_PASSWORD"
            ? "That password is not right. Nothing was deleted."
            : code === "SESSION_EXPIRED"
              ? "For your safety we need a recent sign-in before deleting an account. Sign out, sign in again, and come back here. Nothing was deleted."
              : (failure.message ?? "The account could not be deleted. Nothing was deleted."),
      });
      return;
    }
    clearApiToken();
    try {
      await signOut();
    } catch {
      // The session is already gone with the account.
    }
    toast.success("Your account and your data were deleted.");
    router.push("/");
    router.refresh();
  }

  return (
    <section aria-labelledby="delete-heading" className="border-t border-border pt-8">
      <h2 id="delete-heading" className="text-lg font-semibold">
        Delete account
      </h2>
      <div className="mt-1 max-w-prose space-y-3 text-base text-muted-foreground">
        <p>This erases, for good:</p>
        <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
          <li>your resumes, including the stored files and their extracted text</li>
          <li>your job postings, reports, tailored bullets and cover letters</li>
          <li>your credits and credit history</li>
          <li>your sign-in details, and every session on every device</li>
        </ul>
        <p className="font-semibold text-foreground">It cannot be undone.</p>
        <p>
          One thing is kept: a one-way, salted hash of your email address, and nothing else. It
          cannot be turned back into the address. It exists so the 10 free credits cannot be
          claimed again by deleting and re-registering, so a new account with the same email
          starts with 0 credits.
        </p>
        <p>You can download your data first, above.</p>
      </div>

      {!open ? (
        <Button variant="destructive" className="mt-5" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      ) : (
        <form
          onSubmit={remove}
          className="mt-5 space-y-4 rounded-md border border-pencil/40 p-4 sm:p-5"
          aria-label="Confirm account deletion"
        >
          <div className="space-y-1.5">
            <label htmlFor={emailId} className="text-sm font-semibold">
              Type your email address to confirm
            </label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              placeholder={email}
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              disabled={working}
              aria-invalid={typedEmail.length > 0 && !emailMatches}
            />
          </div>

          {hasPassword ? (
            <div className="space-y-1.5">
              <label htmlFor={passwordId} className="text-sm font-semibold">
                Your password
              </label>
              <Input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={working}
              />
            </div>
          ) : hasPassword === false ? (
            <p className="text-sm text-muted-foreground">
              You sign in with Google, so there is no password to enter. We only check that you
              signed in recently.
            </p>
          ) : null}

          {error && (
            <ErrorNote
              title="The account was not deleted"
              actions={
                error.staleSession ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await signOut();
                      router.push("/sign-in");
                    }}
                  >
                    Sign out and sign in again
                  </Button>
                ) : undefined
              }
            >
              {error.message}
            </ErrorNote>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={!ready || working}>
              {working && <Loader2 className="animate-spin" />}
              {working ? "Deleting" : "Delete my account for good"}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={working}>
              Keep my account
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
