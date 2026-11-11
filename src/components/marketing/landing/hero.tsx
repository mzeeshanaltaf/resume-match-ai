"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/marketing/cta-button";
import { ResumeSpecimen } from "./resume-specimen";

/**
 * The hero. On large screens the section is taller than the viewport and the
 * resume stays pinned while scrolling marks it up, ending with the score. On
 * smaller screens the same markup plays once on a timer when the page comes
 * into view. With reduced motion the page is simply shown finished.
 *
 * `progress` is one stable motion value (0..1) that every mark reads; the
 * mode only decides what writes to it.
 */
type Mode = "pending" | "scroll" | "auto" | "static";

/** Scroll distance (as a share of the pinned run) over which marks draw; the
 *  last 15% holds the finished page before the hero scrolls away. */
const SCROLL_SHARE = 0.85;

export function Hero() {
  const trackRef = useRef<HTMLElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("pending");

  const progress = useMotionValue(0);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  const figureInView = useInView(figureRef, { once: true, amount: 0.3 });
  const hintOpacity = useTransform(progress, [0, 0.04], [1, 0]);

  useEffect(() => {
    if (reduced) {
      setMode("static");
      return;
    }
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => setMode(query.matches ? "scroll" : "auto");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [reduced]);

  // Scroll-linked (large screens)
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (mode === "scroll") progress.set(Math.min(1, v / SCROLL_SHARE));
  });
  useEffect(() => {
    if (mode === "scroll") {
      progress.set(Math.min(1, scrollYProgress.get() / SCROLL_SHARE));
    } else if (mode === "static") {
      progress.set(1);
    }
  }, [mode, progress, scrollYProgress]);

  // Timed (small screens): plays once when the page is in view
  useEffect(() => {
    if (mode !== "auto" || !figureInView) return;
    progress.set(0);
    const controls = animate(progress, 1, { duration: 6.5, delay: 0.5, ease: "linear" });
    return () => controls.stop();
  }, [mode, figureInView, progress]);

  return (
    <section
      ref={trackRef}
      aria-labelledby="hero-title"
      className="relative lg:h-[250svh] motion-reduce:lg:h-auto"
    >
      <div className="lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)] motion-reduce:lg:static motion-reduce:lg:h-auto">
        <div className="mx-auto grid h-full max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:gap-14 lg:px-8 lg:py-6 motion-reduce:lg:py-20">
          <div>
            <h1
              id="hero-title"
              className="max-w-[14ch] text-[clamp(2.5rem,1.2rem+3.6vw,4.25rem)] font-bold leading-[1.04] tracking-[-0.025em] text-balance"
            >
              Your resume, read closely against the job.
            </h1>
            <p className="mt-6 max-w-136 text-[1.0625rem] leading-relaxed text-muted-foreground sm:text-lg">
              Upload a resume, add a job posting, and get a score with the
              reasons written in the margin: what matches, what is missing,
              what to reword. Recruiters can rank a whole stack of resumes
              against one posting.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CtaButton signedOutLabel="Mark up my resume" size="lg" withArrow />
              <Button asChild variant="outline" size="lg">
                <Link href="#report">See a sample report</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              10 free analyses when you sign up. No card needed.
            </p>
          </div>

          <figure
            ref={figureRef}
            className="relative mx-auto w-full max-w-136 lg:ml-auto lg:mr-0 lg:max-w-[calc((100svh-13rem)*0.84)]"
          >
            <ResumeSpecimen progress={progress} />
            <figcaption className="mt-3 text-sm text-muted-foreground">
              A sample resume against a sample posting. Your report is built
              from your own documents.
            </figcaption>
            {mode === "scroll" && (
              <motion.p
                aria-hidden
                style={{ opacity: hintOpacity }}
                className="pointer-events-none absolute -bottom-9 right-2 font-hand text-2xl text-muted-foreground"
              >
                scroll to mark it up ↓
              </motion.p>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
}
