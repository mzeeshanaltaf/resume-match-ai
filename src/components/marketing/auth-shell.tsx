import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MarginNote } from "@/components/proof";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Rendered under the card, e.g. the "Already have an account?" line. */
  footer?: React.ReactNode;
  /** A line in the editor's handwriting, shown beside the form on large screens. */
  note?: string;
}

/**
 * The shared frame for every auth screen (sign-in, sign-up, verify-email,
 * forgot-password) so they stay identical.
 */
export function AuthShell({ title, subtitle, children, footer, note }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-24">
          {note && (
            <aside aria-hidden className="hidden lg:block">
              <p className="max-w-[14ch] text-[3.25rem] leading-[1.05]">
                <MarginNote surface="desk" arrow={false} tilt={-2} immediate duration={1.4}>
                  {note}
                </MarginNote>
              </p>
            </aside>
          )}

          <div className="mx-auto w-full max-w-sm lg:max-w-none">
            <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {subtitle}
                </p>
              </div>

              {children}
            </div>

            {footer && (
              <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
