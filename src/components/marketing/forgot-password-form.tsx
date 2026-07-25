"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { emailOtp } from "@/lib/auth-client";
import { AuthShell } from "@/components/marketing/auth-shell";
import {
  EmailDeliveryNote,
  OtpField,
  useCooldown,
} from "@/components/marketing/otp-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type Step = "request" | "reset";

export function ForgotPasswordForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown(60);

  // Always resolves successfully for unknown addresses (anti-enumeration), so
  // every message below has to stay neutral about whether the account exists.
  async function requestCode(): Promise<boolean> {
    const { error } = await emailOtp.requestPasswordReset({ email });
    if (error) {
      setError(error.message ?? "Could not send a code. Please try again.");
      return false;
    }
    return true;
  }

  async function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!(await requestCode())) return;
      cooldown.start();
      setStep("reset");
      toast.success("If an account exists for that email, we sent a code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      if (!(await requestCode())) return;
      cooldown.start();
      setOtp("");
      toast.success("A new code is on its way.");
    } finally {
      setResending(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await emailOtp.resetPassword({ email, otp, password });
      if (error) {
        setError(error.message ?? "Could not reset your password.");
        return;
      }
      // resetPassword creates no session — send them through sign-in.
      toast.success("Password updated. Sign in with your new password.");
      router.push("/sign-in");
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <>
      Remembered it?{" "}
      <Link
        href="/sign-in"
        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        Back to sign in
      </Link>
    </>
  );

  const errorNode = error && (
    <p className="text-center text-sm text-destructive" role="alert">
      {error}
    </p>
  );

  if (step === "request") {
    return (
      <AuthShell
        title="Forgot your password?"
        subtitle="Enter your email and we'll send you a 6-digit reset code."
        footer={footer}
      >
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="email"
              required
            />
          </div>

          {errorNode}

          <Button
            type="submit"
            disabled={loading}
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset code
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`Enter the code we sent to ${email} and pick a new password.`}
      footer={footer}
    >
      <form onSubmit={handleReset} className="space-y-4">
        <OtpField value={otp} onChange={setOtp} disabled={loading} autoFocus />

        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-sm font-medium">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-sm font-medium">
            Confirm password
          </label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {errorNode}

        <Button
          type="submit"
          disabled={loading}
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Reset password
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full gap-2 text-sm"
          onClick={handleResend}
          disabled={resending || cooldown.active || loading}
        >
          {resending && <Loader2 className="h-4 w-4 animate-spin" />}
          {cooldown.active
            ? `Resend code in ${cooldown.remaining}s`
            : "Resend code"}
        </Button>

        <EmailDeliveryNote />
      </form>
    </AuthShell>
  );
}
