import { cn } from "@/lib/utils";
import { signed } from "@/lib/format";

/**
 * What an action costs, in the ledger form used for credits everywhere:
 * label left, signed amount right in tabular figures, the balance after it
 * underlined. Shown before anything is spent.
 */
export function CostLedger({
  rows,
  balance,
  className,
}: {
  rows: { label: string; amount: number }[];
  /** Current balance; null while it is still loading. */
  balance: number | null;
  className?: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const after = balance === null ? null : balance + total;
  return (
    <table className={cn("w-full max-w-sm border-collapse text-sm", className)}>
      <caption className="sr-only">What this costs and your balance afterwards</caption>
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="py-2 pr-4 text-left font-normal">
              {r.label}
            </th>
            <td className="py-2 text-right font-semibold tabular-nums text-pencil">
              {signed(r.amount)}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-foreground">
          <th scope="row" className="py-2 pr-4 text-left font-semibold">
            Balance after
            {balance !== null && (
              <span className="block text-sm font-normal text-muted-foreground">
                You have {balance} now
              </span>
            )}
          </th>
          <td
            className={cn(
              "py-2 text-right text-lg font-bold tabular-nums",
              after !== null && after < 0 && "text-pencil",
            )}
          >
            {after ?? "–"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
