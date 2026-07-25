import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/marketing/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your ResuMatchAI password with a code sent to your email.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
