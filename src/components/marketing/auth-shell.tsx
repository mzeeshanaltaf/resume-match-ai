import Link from "next/link";
import { FileText } from "lucide-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Rendered under the card, e.g. the "Already have an account?" line. */
  footer?: React.ReactNode;
}

/**
 * The shared frame for every auth screen (sign-in, sign-up, verify-email,
 * forgot-password) so they stay pixel-identical.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
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
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontStyle: "italic",
              }}
            >
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>

        {footer && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
