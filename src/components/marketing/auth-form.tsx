"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Loader2 } from "lucide-react";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
}

export function AuthForm({ mode, googleEnabled }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = isSignUp
      ? await signUp.email({ name, email, password, callbackURL: "/dashboard" })
      : await signIn.email({ email, password, callbackURL: "/dashboard" });

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    if (error) {
      setError(error.message ?? "Google sign-in failed.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
            <FileText className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ResuMatchAI</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <h1
              className="text-2xl tracking-tight"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignUp
                ? "Start matching your resume in seconds."
                : "Sign in to continue to your dashboard."}
            </p>
          </div>

          {googleEnabled && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={handleGoogle}
                disabled={googleLoading || loading}
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />
              </div>
            )}
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
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/sign-up" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                Get started
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
