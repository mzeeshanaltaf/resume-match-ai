"use client";

import { useCallback, useEffect, useState } from "react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { OTP_SENDER_EMAIL } from "@/lib/otp-sender";

interface OtpFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires on the sixth digit — auto-submits the common case. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpField({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: OtpFieldProps) {
  return (
    <div className="flex justify-center">
      <InputOTP
        maxLength={6}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
        autoFocus={autoFocus}
      >
        <InputOTPGroup className="gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className="h-12 w-11 rounded-md border text-lg font-semibold first:rounded-l-md last:rounded-r-md border-l"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

/**
 * Persistent on-screen note, not a toast — toasts vanish at exactly the moment
 * the user switches to their mail client. Naming the sender lets people search
 * their spam folder by address.
 */
export function EmailDeliveryNote() {
  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
      Can&apos;t find the email? Check your spam or junk folder — it arrives from{" "}
      <span className="font-medium break-all text-foreground">
        {OTP_SENDER_EMAIL}
      </span>
      .
    </p>
  );
}

/**
 * Mirrors the server's 3-per-60s send limit so users see a friendly countdown
 * instead of an opaque rate-limit error.
 */
export function useCooldown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, start, active: remaining > 0 };
}
