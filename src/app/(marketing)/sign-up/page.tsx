import type { Metadata } from "next";
import { AuthForm } from "@/components/marketing/auth-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your ResuMatchAI account.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  const googleEnabled =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return <AuthForm mode="sign-up" googleEnabled={googleEnabled} />;
}
