"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { useDraw, type DrawTiming } from "./use-draw";

/**
 * Proof marks: the editor's red pencil, drawn as SVG strokes over real text.
 * Spec in DESIGN.md ("Proof marks"). Phase 6 reuses these in the report.
 *
 *   <Strike>vague phrase</Strike>
 *   <Circled tone="proof">A/B tests</Circled>
 *   <Underlined>4 years</Underlined>
 *   <Insert word="SQL" />            caret under the line, word written above
 *   <MarginNote>no numbers here</MarginNote>
 *   <ScoreMark value="78" suffix="%" />
 *
 * Every mark accepts `DrawTiming` (`progress` + `range` to scrub with scroll,
 * or `delay`/`duration` to draw itself when it scrolls into view, or `still`).
 * They are decorative to assistive tech; the meaning must also be in text.
 */

export type MarkTone = "pencil" | "proof" | "ink";
/** `desk`: drawn on the app background. `page`: drawn on the paper sheet,
 *  where the marks keep their light-theme colors in dark mode. */
export type MarkSurface = "desk" | "page";

const TONE_CLASS: Record<MarkSurface, Record<MarkTone, string>> = {
  desk: {
    pencil: "text-pencil",
    proof: "text-proof",
    ink: "text-foreground",
  },
  page: {
    pencil: "text-page-pencil",
    proof: "text-page-proof",
    ink: "text-page-foreground",
  },
};

export function toneClass(tone: MarkTone = "pencil", surface: MarkSurface = "desk") {
  return TONE_CLASS[surface][tone];
}

interface MarkProps extends DrawTiming {
  tone?: MarkTone;
  surface?: MarkSurface;
  className?: string;
}

/* ─── Primitive ────────────────────────────────────────────────────────── */

interface ProofStrokeProps extends DrawTiming {
  /** SVG path data. Use `pathLength`-safe single strokes. */
  d: string | string[];
  viewBox: string;
  tone?: MarkTone;
  surface?: MarkSurface;
  strokeWidth?: number;
  className?: string;
  /** Sub-range of the mark's draw (0..1) this path occupies, for multi-path marks. */
  segments?: [number, number][];
  preserveAspectRatio?: string;
}

/** An absolutely-positioned SVG whose paths draw themselves. Place inside a
 *  `relative` parent; size and offset it with `className`. */
export function ProofStroke({
  d,
  viewBox,
  tone = "pencil",
  surface = "desk",
  strokeWidth = 3,
  className,
  segments,
  preserveAspectRatio = "none",
  ...timing
}: ProofStrokeProps) {
  const { ref, value } = useDraw(timing);
  const paths = Array.isArray(d) ? d : [d];
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute", toneClass(tone, surface), className)}
    >
      <svg
        viewBox={viewBox}
        preserveAspectRatio={preserveAspectRatio}
        className="h-full w-full overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((p, i) => (
          <DrawnPath key={i} d={p} value={value} segment={segments?.[i]} />
        ))}
      </svg>
    </span>
  );
}

function DrawnPath({
  d,
  value,
  segment = [0, 1],
}: {
  d: string;
  value: MotionValue<number>;
  segment?: [number, number];
}) {
  const length = useTransform(value, segment, [0, 1], { clamp: true });
  // A zero-length dash still paints a dot with round caps; hide it until drawn.
  const opacity = useTransform(length, (v) => (v > 0.002 ? 1 : 0));
  return <motion.path d={d} style={{ pathLength: length, opacity }} />;
}

/* ─── Marks over text ──────────────────────────────────────────────────── */

type TextMarkProps = MarkProps & {
  children: React.ReactNode;
  /** Let long text wrap inside the mark instead of staying on one line. */
  wrap?: boolean;
  /** Stroke width in the mark's own units (default 3 ≈ 0.14em). Lower it for very large text. */
  strokeWidth?: number;
};

/** A line struck through a word or short phrase. Keep phrases short: the
 *  wrapper does not break across lines. */
export function Strike({
  children,
  tone = "pencil",
  surface = "desk",
  className,
  wrap = false,
  strokeWidth,
  ...timing
}: TextMarkProps) {
  return (
    <span className={cn("relative inline-block", wrap ? "max-w-full" : "whitespace-nowrap", className)}>
      {children}
      <ProofStroke
        strokeWidth={strokeWidth}
        d="M0 6.5 C 18 3.2, 44 8.6, 70 5 S 92 3.4, 100 2.6"
        viewBox="0 0 100 10"
        tone={tone}
        surface={surface}
        className="-left-[3%] top-[50%] h-[0.5em] w-[106%] -translate-y-1/2"
        duration={0.5}
        {...timing}
      />
    </span>
  );
}

/** A loop drawn around a word or short phrase. */
export function Circled({
  children,
  tone = "pencil",
  surface = "desk",
  className,
  strokeWidth,
  ...timing
}: TextMarkProps) {
  return (
    <span className={cn("relative mx-[0.12em] inline-block whitespace-nowrap", className)}>
      {children}
      <ProofStroke
        strokeWidth={strokeWidth}
        d="M56 4 C 78 2, 97 9, 96 21 C 95 33, 70 38, 45 37 C 20 36, 3 29, 4 18 C 5 8, 28 3, 58 4 C 70 4.5, 80 7, 86 11"
        viewBox="0 0 100 40"
        tone={tone}
        surface={surface}
        className="-inset-x-[7%] -inset-y-[24%]"
        duration={0.8}
        {...timing}
      />
    </span>
  );
}

/** A wavy line under a word or short phrase. */
export function Underlined({
  children,
  tone = "pencil",
  surface = "desk",
  className,
  wrap = false,
  strokeWidth,
  ...timing
}: TextMarkProps) {
  return (
    <span className={cn("relative inline-block", wrap ? "max-w-full" : "whitespace-nowrap", className)}>
      {children}
      <ProofStroke
        strokeWidth={strokeWidth}
        d="M1 6 C 14 2.5, 26 9, 44 4.8 S 76 3.2, 99 6.4"
        viewBox="0 0 100 10"
        tone={tone}
        surface={surface}
        className="left-0 top-full h-[0.45em] w-full -translate-y-[0.1em]"
        duration={0.5}
        {...timing}
      />
    </span>
  );
}

/* ─── Handwriting ──────────────────────────────────────────────────────── */

/** Left-to-right clip wipe so handwriting reads as written, not typed. */
function useWipe(value: MotionValue<number>) {
  return useTransform(value, (v) => `inset(-20% ${(1 - v) * 100}% -20% -5%)`);
}

interface HandProps extends MarkProps {
  children: React.ReactNode;
}

function HandText({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: MotionValue<number>;
  className?: string;
}) {
  const clipPath = useWipe(value);
  return (
    <motion.span className={cn("inline-block", className)} style={{ clipPath }}>
      {children}
    </motion.span>
  );
}

/**
 * A handwritten margin note with an optional arrow pointing back at the text.
 * Sentence-case, a few words, in the editor's voice.
 */
export function MarginNote({
  children,
  tone = "pencil",
  surface = "page",
  arrow = true,
  tilt = -1.5,
  className,
  ...timing
}: HandProps & { arrow?: boolean; tilt?: number }) {
  const { ref, value } = useDraw({ duration: 0.7, ...timing });
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-start gap-[0.2em] font-hand leading-[1.05]",
        toneClass(tone, surface),
        className,
      )}
      style={{ rotate: `${tilt}deg` }}
    >
      {arrow && (
        <ProofStroke
          d={["M26 12 C 18 15, 10 10, 3 12", "M3 12 L 9 7", "M3 12 L 9 17"]}
          segments={[[0, 0.7], [0.7, 0.85], [0.85, 1]]}
          viewBox="0 0 28 24"
          tone={tone}
          surface={surface}
          strokeWidth={2}
          progress={value}
          className="static mt-[0.15em] inline-block h-[0.9em] w-[1.05em] shrink-0"
        />
      )}
      <HandText value={value}>{children}</HandText>
    </span>
  );
}

/**
 * The grade, written in the corner and circled. `value` is the number as
 * text; the written score and the loop around it are the same moment.
 */
export function ScoreMark({
  value: score,
  suffix,
  tone = "pencil",
  surface = "page",
  className,
  ...timing
}: MarkProps & { value: string; suffix?: string }) {
  const { ref, value } = useDraw({ duration: 1.1, ...timing });
  const written = useTransform(value, [0, 0.55], [0, 1], { clamp: true });
  return (
    <span
      ref={ref}
      className={cn(
        "relative inline-flex items-baseline font-hand leading-none",
        toneClass(tone, surface),
        className,
      )}
      style={{ rotate: "-4deg" }}
    >
      <HandText value={written}>
        <span className="px-[0.3em] py-[0.12em]">
          {score}
          {suffix && <span className="text-[0.6em]">{suffix}</span>}
        </span>
      </HandText>
      <ProofStroke
        d="M52 3 C 80 1, 97 11, 94 24 C 91 38, 62 43, 40 42 C 14 41, 3 31, 6 19 C 9 8, 32 3, 58 4 C 72 5, 82 8, 88 13"
        viewBox="0 0 100 46"
        tone={tone}
        surface={surface}
        strokeWidth={2.5}
        progress={value}
        range={[0.5, 1]}
        className="-inset-x-[4%] -inset-y-[6%]"
      />
    </span>
  );
}

/**
 * An editor's insertion: a caret under the line and the missing word written
 * above it. Zero-width, so drop it between the two words it separates.
 * The line it sits in needs generous line-height (about 2).
 */
export function Insert({
  word,
  tone = "pencil",
  surface = "page",
  className,
  ...timing
}: MarkProps & { word: string }) {
  const { ref, value } = useDraw({ duration: 0.6, ...timing });
  const written = useTransform(value, [0.45, 1], [0, 1], { clamp: true });
  return (
    <span
      ref={ref}
      className={cn("relative inline-block h-0 w-0 align-baseline", className)}
    >
      <ProofStroke
        d="M2 14 L 8 3 L 14 14"
        viewBox="0 0 16 16"
        tone={tone}
        surface={surface}
        strokeWidth={1.8}
        progress={value}
        range={[0, 0.5]}
        preserveAspectRatio="xMidYMid meet"
        className="left-0 top-[0.7em] h-[0.95em] w-[0.95em] -translate-x-1/2"
      />
      <span
        aria-hidden
        className={cn(
          "absolute bottom-[0.55em] left-0 -translate-x-1/2 whitespace-nowrap font-hand text-[1.7em] leading-none",
          toneClass(tone, surface),
        )}
        style={{ rotate: "-3deg" }}
      >
        <HandText value={written}>{word}</HandText>
      </span>
    </span>
  );
}
