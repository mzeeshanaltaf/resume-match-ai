"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Loader2 } from "lucide-react";

export interface ProgressStep {
  message: string;
  duration: number; // ms; use Infinity for the last step
}

interface ShimmeringProgressDialogProps {
  open: boolean;
  title: string;
  steps: ProgressStep[];
}

export function ShimmeringProgressDialog({ open, title, steps }: ShimmeringProgressDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return;
    }

    let current = 0;

    function advance() {
      const next = current + 1;
      if (next < steps.length && steps[next].duration !== Infinity) {
        current = next;
        setStepIndex(current);
        timer = setTimeout(advance, steps[current].duration);
      } else if (next < steps.length) {
        current = next;
        setStepIndex(current);
      }
    }

    let timer = setTimeout(advance, steps[0].duration);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm text-center [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Spinner */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>

          {/* Messages */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="min-h-[2rem] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <ShimmeringText
                    text={steps[stepIndex]?.message ?? ""}
                    className="text-lg font-semibold"
                    duration={2}
                    spread={3}
                    startOnView={false}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                className="h-1.5 rounded-full bg-emerald-500"
                animate={{
                  width: i === stepIndex ? 24 : 6,
                  opacity: i <= stepIndex ? 1 : 0.3,
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
