import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStep } from "@/lib/api/types";

/**
 * Live progress for a backend job, fed by its event stream. It lists the steps
 * the server has actually reached (parsing, checking, saving, ...), in order,
 * so the wait is explained instead of hidden behind a modal. It never blocks
 * the page and carries no timer of its own.
 */
export function StepList({
  steps,
  heading,
  note,
  className,
}: {
  steps: JobStep[];
  heading: string;
  /** One line under the list, e.g. "You can leave this page". */
  note?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-md border border-border bg-card p-4", className)}
    >
      <p className="text-sm font-semibold">{heading}</p>
      <ol className="mt-3 space-y-2">
        {steps.length === 0 ? (
          <StepRow status="running" label="Starting" />
        ) : (
          steps.map((s) => (
            <StepRow key={s.name} status={s.status} label={s.label || s.name} />
          ))
        )}
      </ol>
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function StepRow({
  status,
  label,
}: {
  status: JobStep["status"];
  label: string;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 text-sm",
        status === "running" ? "text-foreground" : "text-muted-foreground",
        status === "failed" && "text-pencil",
      )}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {status === "running" && <Loader2 className="size-4 animate-spin" />}
        {status === "done" && <Check className="size-4 text-proof" />}
        {status === "failed" && <X className="size-4" />}
      </span>
      <span className={cn(status === "running" && "font-medium")}>
        {label}
        <span className="sr-only">
          {status === "done" ? " (done)" : status === "failed" ? " (failed)" : " (in progress)"}
        </span>
      </span>
    </li>
  );
}
