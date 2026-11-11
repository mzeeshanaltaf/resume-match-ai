"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Circled, MarginNote, Strike, Underlined } from "@/components/proof";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the report, which is laid out as the document it is
 * about: a sheet of paper (`Paper`), entries with the editor's note in the
 * margin (`Entry`), and sections separated by rules instead of cards.
 * Everything on the sheet reads the `page-*` tokens, so it stays paper in
 * dark mode.
 */

export function Paper({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <article
      aria-label={label}
      className={cn(
        "report-sheet rounded-page bg-page p-5 font-serif text-[1.0625rem] leading-[1.7] text-page-foreground shadow-sheet sm:p-8 lg:p-10",
        "print:bg-transparent print:p-0 print:shadow-none",
        className,
      )}
    >
      {children}
    </article>
  );
}

/**
 * Classes for a button that sits ON the paper. The sheet keeps its light colors in
 * dark mode, so a themed outline button (dark card, light text) would vanish on it.
 */
export const paperButton =
  "border-page-muted bg-page font-sans text-page-foreground hover:bg-page-rule hover:text-page-foreground";

/** A titled run of entries, divided from the one before it by a rule. */
export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-page-rule pt-6 first:mt-0 first:border-t-0 first:pt-0">
      <h2 className="font-sans text-lg font-semibold leading-snug print:break-after-avoid">
        {title}
        {count != null && (
          <span className="ml-2 text-base font-normal text-page-muted">{count}</span>
        )}
      </h2>
      <div className="mt-1 divide-y divide-page-rule">{children}</div>
    </section>
  );
}

/** A section that starts closed on screen. It is always open when printed. */
export function Fold({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="mt-10 border-t border-page-rule pt-6">
      <h2 className="font-sans text-lg font-semibold leading-snug print:break-after-avoid">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-page-proof focus-visible:ring-offset-2 print:pointer-events-none"
        >
          <span>
            {title}
            {count != null && (
              <span className="ml-2 text-base font-normal text-page-muted">{count}</span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 shrink-0 text-page-muted transition-transform duration-150 print:hidden",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div id={id} className={cn("mt-1 divide-y divide-page-rule", !open && "hidden print:block")}>
        {children}
      </div>
    </section>
  );
}

/**
 * One finding. The text sits in the main column; the editor's note, when
 * there is one, hangs in the right margin from `xl` and falls under the text
 * on narrower screens. The note is real text, so it also reads in print and
 * for assistive tech; only its strokes are decorative.
 */
export function Entry({
  note,
  tone = "pencil",
  children,
}: {
  note?: string | null;
  tone?: "pencil" | "proof" | "ink";
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-10 gap-y-2 py-4 xl:grid-cols-[minmax(0,1fr)_13rem] print:break-inside-avoid">
      <div className="min-w-0 space-y-1.5">{children}</div>
      {note && (
        <div className="xl:pt-1">
          <MarginNote tone={tone} surface="page" className="text-2xl" delay={0.1}>
            {note}
          </MarginNote>
        </div>
      )}
    </div>
  );
}

/** A label and its text on one line of the document ("The posting asks for: ..."). */
export function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-[0.9375rem] leading-relaxed text-page-muted", className)}>
      <span className="font-sans font-semibold text-page-foreground">{label}</span> {children}
    </p>
  );
}

/* ─── Marks that degrade to plain text decoration on long phrases ───────── */

type MarkKind = "underline" | "strike" | "circle";
type MarkTone = "pencil" | "proof";

/** Longest phrase each hand-drawn mark can wear without overflowing a phone. */
const MARK_LIMIT: Record<MarkKind, number> = { underline: 40, strike: 28, circle: 22 };

const DECORATION_TONE: Record<MarkTone, string> = {
  pencil: "decoration-page-pencil",
  proof: "decoration-page-proof",
};

/**
 * Marks a phrase the way an editor would. Short phrases get the drawn stroke;
 * long ones (a whole sentence) get the same mark as a plain text decoration,
 * because a stroke cannot follow text across lines.
 */
export function Marked({
  kind,
  tone,
  children,
}: {
  kind: MarkKind;
  tone: MarkTone;
  children: string;
}) {
  const text = children;
  if (text.length <= MARK_LIMIT[kind]) {
    if (kind === "strike") return <Strike tone={tone} surface="page">{text}</Strike>;
    if (kind === "circle") {
      return (
        <Circled tone={tone} surface="page" className="px-1.5">
          {text}
        </Circled>
      );
    }
    return (
      <Underlined tone={tone} surface="page" wrap>
        {text}
      </Underlined>
    );
  }
  return (
    <span
      className={cn(
        DECORATION_TONE[tone],
        kind === "strike"
          ? "line-through decoration-2"
          : "underline decoration-wavy decoration-1 underline-offset-4",
      )}
    >
      {text}
    </span>
  );
}

/** "high impact, hard to fix": the editor's note, in the editor's voice (lower case). */
export function noteFrom(...parts: (string | null | undefined)[]): string | null {
  const text = parts
    .map((p) => p?.trim().toLowerCase())
    .filter(Boolean)
    .join(", ");
  return text || null;
}
