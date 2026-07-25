"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { emailOtp } from "@/lib/auth-client";
import { AuthShell } from "@/components/marketing/auth-shell";
import {
  EmailDeliveryNote,
  OtpField,
  useCooldown,
} from "@/components/marketing/otp-field";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown(60);

  // A code is always sent by the server before the user gets here (sign-up, or
  // the EMAIL_NOT_VERIFIED sign-in path), so never send one on mount — that
  // double-sends and burns the rate limit.
  useEffect(() => {
    if (!email) router.replace("/sign-up");
  }, [email, router]);

  async function handleVerify(code: string) {
    if (code.length !== 6 || verifying) return;
    setError(null);
    setVerifying(true);
    try {
      const { error } = await emailOtp.verifyEmail({ email, otp: code });
      if (error) {
        setError(error.message ?? "That code isn't valid. Please try again.");
        setOtp("");
        return;
      }
      // autoSignInAfterVerification means the session already exists.
      router.push(redirectTo);
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      const { error } = await emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        setError(error.message ?? "Could not send a new code.");
        return;
      }
      cooldown.start();
      setOtp("");
      toast.success("A new code is on its way.");
    } finally {
      setResending(false);
    }
  }

  if (!email) return null;

  return (
    <AuthShell
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email}.`}
      footer={
        <>
          Wrong email?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Start over
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleVerify(otp);
        }}
        className="space-y-4"
      >
        <OtpField
          value={otp}
          onChange={setOtp}
          onComplete={(code) => void handleVerify(code)}
          disabled={verifying}
          autoFocus
        />

        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={verifying || otp.length !== 6}
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify email
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full gap-2 text-sm"
          onClick={handleResend}
          disabled={resending || cooldown.active || verifying}
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
