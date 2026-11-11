"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/dashboard/notes";

/** Last resort for a screen that threw while rendering. The shell stays usable. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl pt-8">
      <ErrorNote
        title="This screen hit a problem"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={reset}>
              Try again
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard">Back to Overview</Link>
            </Button>
          </>
        }
      >
        Nothing you have saved was lost. If it keeps happening, tell us on the contact page.
      </ErrorNote>
    </div>
  );
}
