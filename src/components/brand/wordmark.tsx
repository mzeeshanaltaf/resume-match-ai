import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The logo mark: a page of text with a red-pencil tick through its corner.
 * Ink and paper come from the theme; the tick is always the red pencil.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-6 w-6 shrink-0", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="3.75"
        y="2.75"
        width="14.5"
        height="18.5"
        rx="1.25"
        className="fill-card stroke-foreground"
        strokeWidth="1.6"
      />
      <path d="M7.5 7.5h7M7.5 11h4.5" className="stroke-foreground" strokeWidth="1.6" />
      <path d="M11.5 16.2l2.9 2.9L21.2 11" className="stroke-pencil" strokeWidth="2.2" />
    </svg>
  );
}

export function Wordmark({
  className,
  href = "/",
  size = "md",
}: {
  className?: string;
  /** Pass `null` to render without a link. */
  href?: string | null;
  size?: "md" | "lg";
}) {
  const content = (
    <>
      <LogoMark className={size === "lg" ? "h-8 w-8" : "h-6 w-6"} />
      <span
        className={cn(
          "font-bold tracking-tight",
          size === "lg" ? "text-xl" : "text-[1.0625rem]",
        )}
      >
        ResuMatchAI
      </span>
    </>
  );
  const classes = cn("inline-flex items-center gap-2 text-foreground", className);
  return href === null ? (
    <span className={classes}>{content}</span>
  ) : (
    <Link href={href} className={cn(classes, "rounded-sm")} aria-label="ResuMatchAI home">
      {content}
    </Link>
  );
}
