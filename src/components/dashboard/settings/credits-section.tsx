"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LEDGER_LIMIT, useDashboardData } from "@/contexts/dashboard-data";
import type { CreditTransaction } from "@/lib/api/types";
import { formatDate, plural, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorNote } from "@/components/dashboard/notes";
import { ScrollRegion } from "@/components/dashboard/scroll-region";

/** Label for a ledger row: what the backend recorded, with a fallback for each type. */
function describe(tx: CreditTransaction): string {
  if (tx.description) return tx.description;
  if (tx.name_snapshot) return tx.name_snapshot;
  return tx.transaction_type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function CreditsSection() {
  const { creditBalance, credits, creditHistory, loading, error, refreshCredits } =
    useDashboardData();

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6" aria-busy="true" aria-label="Loading your credits">
        <Skeleton className="h-16 w-40" />
        <div className="space-y-px">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  if (creditBalance === null) {
    return (
      <ErrorNote
        title="Your credits did not load"
        className="max-w-xl"
        actions={
          <Button size="sm" variant="outline" onClick={() => refreshCredits()}>
            Try again
          </Button>
        }
      >
        {error ?? "Something went wrong while loading your balance."}
      </ErrorNote>
    );
  }

  // Walk the ledger from the newest row back, so each row shows the balance after it.
  let running = creditBalance;
  const rows = (creditHistory ?? []).map((tx) => {
    const after = running;
    running -= tx.credits_delta;
    return { tx, after };
  });
  const costs = credits?.costs;

  return (
    <div className="max-w-2xl space-y-10">
      <section aria-labelledby="balance-heading">
        <h2 id="balance-heading" className="text-lg font-semibold">
          Balance
        </h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              "text-5xl font-bold leading-none tabular-nums",
              creditBalance === 0 && "text-pencil",
            )}
          >
            {creditBalance}
          </span>
          <span className="text-base text-muted-foreground">
            {creditBalance === 1 ? "credit" : "credits"} left
          </span>
        </p>
        {creditBalance === 0 && (
          <p className="mt-3 max-w-prose text-base">
            You are out of credits. You can still upload resumes, add postings and read every
            report you already have.{" "}
            <Link href="/contact" className="font-semibold underline underline-offset-4">
              Ask about more
            </Link>
            .
          </p>
        )}
      </section>

      {costs && (
        <section aria-labelledby="costs-heading" className="border-t border-border pt-8">
          <h2 id="costs-heading" className="text-lg font-semibold">
            What things cost
          </h2>
          <table className="mt-3 w-full max-w-md border-collapse text-base">
            <caption className="sr-only">Credit price of each action</caption>
            <tbody className="divide-y divide-border">
              {[
                ["Job Fit analysis", plural(costs.match, "credit")],
                ["Screener, per resume", plural(costs.screening_per_resume, "credit")],
                ["Cover letter draft", plural(costs.cover_letter, "credit")],
                ["Tailored bullets", "free, once per analysis"],
                ["Uploading resumes, adding postings", "free"],
              ].map(([label, price]) => (
                <tr key={label}>
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    {label}
                  </th>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="ledger-heading" className="border-t border-border pt-8">
        <h2 id="ledger-heading" className="text-lg font-semibold">
          Ledger
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-base text-muted-foreground">
            Nothing yet. Every credit that comes in or goes out will be listed here.
          </p>
        ) : (
          <ScrollRegion label="Credit ledger" className="mt-3">
            <table className="w-full border-collapse text-left text-base">
              <caption className="sr-only">Every credit you received or spent, newest first</caption>
              <thead>
                <tr className="border-b-2 border-foreground text-sm">
                  <th scope="col" className="w-28 py-2 pr-4 font-semibold">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    What
                  </th>
                  <th scope="col" className="w-20 py-2 pr-4 text-right font-semibold">
                    Credits
                  </th>
                  <th scope="col" className="hidden w-20 py-2 text-right font-semibold sm:table-cell">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ tx, after }) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 pr-4 text-sm text-muted-foreground">
                      {formatDate(tx.created_at)}
                    </td>
                    <td className="py-2.5 pr-4">{describe(tx)}</td>
                    <td
                      className={cn(
                        "py-2.5 pr-4 text-right font-semibold tabular-nums",
                        tx.credits_delta > 0 ? "text-proof" : "text-pencil",
                      )}
                    >
                      {signed(tx.credits_delta)}
                    </td>
                    <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= LEDGER_LIMIT && (
              <p className="mt-3 text-sm text-muted-foreground">
                Showing the latest {LEDGER_LIMIT} entries. Your data export has all of them.
              </p>
            )}
          </ScrollRegion>
        )}
      </section>
    </div>
  );
}
