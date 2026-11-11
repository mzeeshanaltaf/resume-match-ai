import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** The numbered steps of a flow (Job Fit, Screener). Plain, readable, no decoration. */
export function FlowSteps({
  steps,
  current,
}: {
  steps: string[];
  /** 1-based index of the step the user is on. */
  current: number;
}) {
  return (
    <ol aria-label="Progress" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                done && "border-proof bg-proof text-proof-foreground",
                active && "border-foreground bg-foreground text-background",
                !done && !active && "border-input text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : n}
            </span>
            <span className={cn(active ? "font-semibold" : "text-muted-foreground")}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {n < steps.length && (
              <span aria-hidden className="mx-1.5 h-px w-5 bg-border sm:w-8" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
