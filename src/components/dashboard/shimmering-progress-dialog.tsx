"use client";

import { AnimatePresence, motion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Loader2 } from "lucide-react";
import type { JobStep } from "@/lib/api/types";

interface ShimmeringProgressDialogProps {
  open: boolean;
  title: string;
  /** Live steps from the job's event stream (empty until the first event). */
  steps: JobStep[];
  /** Expected number of steps, if known up front (e.g. one per resume). */
  total?: number;
  /** Overrides the label derived from the steps. */
  message?: string;
}

/**
 * Temporary blocking progress UI (Phase 6 replaces it with an inline step
 * list). It now shows what the backend is really doing, from job events,
 * instead of a timed fake sequence.
 */
export function ShimmeringProgressDialog({
  open,
  title,
  steps,
  total,
  message,
}: ShimmeringProgressDialogProps) {
  const running = steps.find((s) => s.status === "running");
  const lastDone = [...steps].reverse().find((s) => s.status === "done");
  const label =
    message ?? running?.label ?? lastDone?.label ?? (steps.length ? "Working…" : "Starting…");

  const dots = Math.max(total ?? 0, steps.length, 1);
  const done = steps.filter((s) => s.status === "done").length;
  const activeIndex = Math.min(done, dots - 1);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm text-center [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Spinner */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>

          {/* Messages */}
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="min-h-[2rem] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <ShimmeringText
                    text={label}
                    className="text-lg font-semibold"
                    duration={2}
                    spread={3}
                    startOnView={false}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress dots: one per step, filled once reached */}
          <div className="flex gap-1.5">
            {Array.from({ length: dots }, (_, i) => (
              <motion.div
                key={i}
                className="h-1.5 rounded-full bg-emerald-500"
                animate={{
                  width: i === activeIndex ? 24 : 6,
                  opacity: i <= activeIndex ? 1 : 0.3,
                }}
                transition={{ duration: 0.3 }}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
