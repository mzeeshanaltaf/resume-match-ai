"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface ReportTab {
  id: string;
  label: string;
  /** e.g. "ready" when a document already exists. */
  hint?: string;
}

/**
 * Tabs for the report: analysis, tailored bullets, cover letter. Written out
 * (instead of using the Radix tabs) for one reason: every panel must stay in
 * the page so that printing the report prints all of it, which a tab library
 * that hides inactive panels with `[hidden]` cannot do.
 */
export function ReportTabs({
  tabs,
  value,
  onChange,
  idPrefix,
}: {
  tabs: ReportTab[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Parts of the report" className="flex gap-1 border-b border-border print:hidden">
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold outline-none transition-colors duration-150 md:min-h-10",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.hint && (
              <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">{tab.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A panel that is hidden on screen unless selected, and always shown in print. */
export function ReportPanel({
  id,
  idPrefix,
  active,
  children,
}: {
  id: string;
  idPrefix: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        !active && "hidden print:block",
      )}
    >
      {children}
    </div>
  );
}
