"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  useInView,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

/**
 * How a proof mark gets drawn. Exactly one driver is used:
 *  - `progress`: a shared 0..1 motion value (e.g. scroll progress). The mark
 *    draws while progress moves through `range`.
 *  - otherwise the mark times itself: it waits `delay` seconds after entering
 *    the viewport (or after mount with `immediate`) and draws over `duration`.
 *  - `still` renders the finished mark with no animation.
 * Under `prefers-reduced-motion` every mark is rendered finished, whatever the
 * driver.
 */
export interface DrawTiming {
  progress?: MotionValue<number>;
  /** The slice of `progress` during which this mark draws. Default [0, 1]. */
  range?: [number, number];
  /** Seconds to wait before self-timed drawing starts. */
  delay?: number;
  /** Seconds a self-timed draw takes. */
  duration?: number;
  /** Self-timed marks start on mount instead of when scrolled into view. */
  immediate?: boolean;
  /** Render finished, no animation. */
  still?: boolean;
}

const FULL_RANGE: [number, number] = [0, 1];
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/** Returns a 0..1 motion value for how much of the mark is drawn, plus a ref
 *  to attach to the mark's outer element (used for in-view detection). */
export function useDraw({
  progress,
  range = FULL_RANGE,
  delay = 0,
  duration = 0.6,
  immediate = false,
  still = false,
}: DrawTiming) {
  // Read the preference after mount, not during render: motion's own hook
  // answers on the first client render, which would not match the server HTML.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });

  const own = useMotionValue(0);
  const finished = useMotionValue(1);
  const driven = useTransform(progress ?? own, range, [0, 1], { clamp: true });

  const selfTimed = !progress && !still && !reduced;

  useEffect(() => {
    if (!selfTimed) return;
    if (!immediate && !inView) return;
    const controls = animate(own, 1, { delay, duration, ease: EASE_OUT_QUART });
    return () => controls.stop();
  }, [selfTimed, immediate, inView, delay, duration, own]);

  return { ref, value: still || reduced ? finished : driven };
}
