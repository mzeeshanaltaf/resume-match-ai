"use client";

import { Briefcase, Building2, ExternalLink, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { JobDescription } from "@/lib/api/types";

export type JdPreviewTarget = { jd: JobDescription | null; url?: string };

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Turns a stored link into one that is safe to render, or undefined. */
export function safeUrl(value: string | null | undefined): string | undefined {
  return isHttpUrl(value) ? value : undefined;
}

function Block({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="text-base text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The job posting as the app extracted it, read-only. */
export function JdPreviewDialog({
  target,
  onClose,
}: {
  target: JdPreviewTarget | null;
  onClose: () => void;
}) {
  const jd = target?.jd ?? null;
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {jd?.job_title ?? "Job posting"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            The job posting as it was read for the analysis.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-5">
            {(jd?.company_name || jd?.location || jd?.employment_type || target.url) && (
              <div className="space-y-2 border-y border-border py-3 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {jd?.company_name && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="size-4" aria-hidden /> {jd.company_name}
                    </span>
                  )}
                  {jd?.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden /> {jd.location}
                    </span>
                  )}
                  {jd?.employment_type && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="size-4" aria-hidden /> {jd.employment_type}
                    </span>
                  )}
                </div>
                {target.url && (
                  <a
                    href={target.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 break-all font-medium text-proof underline underline-offset-2"
                  >
                    <ExternalLink className="size-4 shrink-0" aria-hidden /> {target.url}
                  </a>
                )}
              </div>
            )}

            {jd?.description && (
              <section>
                <h3 className="text-sm font-semibold">Description</h3>
                <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {jd.description}
                </p>
              </section>
            )}
            <Block title="Responsibilities" items={jd?.responsibilities} />
            <Block title="Requirements" items={jd?.requirements} />
            <Block title="Benefits" items={jd?.benefits} />

            {!jd && !target.url && (
              <p className="py-4 text-center text-base text-muted-foreground">
                No details were kept for this posting.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
