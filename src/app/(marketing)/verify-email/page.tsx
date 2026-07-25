import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/marketing/verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Enter the code we emailed you to finish setting up your account.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  // useSearchParams() opts the route into client-side rendering; without a
  // Suspense boundary the production build errors.
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
