import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { plural } from "@/lib/format";

/**
 * A problem and what to do about it. Red pencil on its wash, with a word and an
 * icon as well as the color. Use `RequestError` when you have the raw error.
 */
export function ErrorNote({
  title,
  children,
  actions,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-pencil/40 bg-pencil-wash p-4 text-foreground",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-pencil">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        {title}
      </p>
      {children && <div className="mt-1.5 text-sm">{children}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** 402: not enough credits. Says how many are needed and what still works. */
export function NoCredits({
  needed,
  balance,
  className,
}: {
  needed: number | null;
  balance: number | null;
  className?: string;
}) {
  return (
    <ErrorNote
      title="Not enough credits"
      className={className}
      actions={
        <>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings?tab=credits">See your credits</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/contact">Ask about more</Link>
          </Button>
        </>
      }
    >
      {needed !== null && balance !== null ? (
        <>
          This needs {plural(needed, "credit")} and you have {balance}.{" "}
        </>
      ) : (
        <>You do not have enough credits for this. </>
      )}
      Uploading resumes and adding job postings is still free, and your reports stay
      available.
    </ErrorNote>
  );
}

/**
 * The right note for a failed request or job: the 402 note with the real
 * numbers, otherwise the specific message from `describeError`.
 */
export function RequestError({
  error,
  title,
  fallback,
  actions,
  className,
}: {
  error: unknown;
  title: string;
  fallback?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  if (error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS") {
    const needed = typeof error.details?.needed === "number" ? error.details.needed : null;
    const balance = typeof error.details?.balance === "number" ? error.details.balance : null;
    return <NoCredits needed={needed} balance={balance} className={className} />;
  }
  return (
    <ErrorNote title={title} actions={actions} className={className}>
      {describeError(error, fallback)}
    </ErrorNote>
  );
}
