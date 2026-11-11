import { cn } from "@/lib/utils";

/**
 * A wrapper for a wide table on a narrow screen. It scrolls sideways, and
 * because a scrolling area must be reachable without a mouse it takes focus
 * (arrow keys then scroll it) and is announced with a name.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        // `relative`: screen-reader-only text inside the table is absolutely positioned and
        // would otherwise be placed against the page, widening it.
        "relative overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {children}
    </div>
  );
}
