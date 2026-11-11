"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarginNote } from "@/components/proof";
import { useDashboardData } from "@/contexts/dashboard-data";
import { api, isAbortError, isApiError, waitForJob } from "@/lib/api/client";
import type {
  CoverLetterContent,
  DocumentJobResult,
  GeneratedDocumentOut,
  JobAccepted,
  JobStep,
  MatchOut,
  TailoredBulletsContent,
} from "@/lib/api/types";
import { formatDate, plural } from "@/lib/format";
import { CostLedger } from "@/components/dashboard/cost-ledger";
import { NoCredits, RequestError } from "@/components/dashboard/notes";
import { StepList } from "@/components/dashboard/step-list";
import { Marked, Paper, Section, paperButton } from "./report-parts";

/* ─── Generating a document as a backend job ─────────────────────────────── */

function useGenerate({
  start,
  onDone,
  onConflict,
}: {
  start: () => Promise<JobAccepted>;
  onDone: (doc: GeneratedDocumentOut) => void;
  /** The server says this already exists (a second tab, a double click): reload it. */
  onConflict: () => void;
}) {
  const { refreshCredits } = useDashboardData();
  const [working, setWorking] = useState(false);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setError(null);
    setSteps([]);
    try {
      const { job_id } = await start();
      const result = await waitForJob<DocumentJobResult>(job_id, {
        onSteps: setSteps,
        signal: controller.signal,
      });
      onDone(result.document);
    } catch (err) {
      if (isAbortError(err)) return;
      if (isApiError(err, "ALREADY_GENERATED")) onConflict();
      else setError(err);
    } finally {
      if (!controller.signal.aborted) setWorking(false);
      refreshCredits(); // a cover letter spends a credit, a failure returns it
    }
  }

  return { working, steps, error, run };
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
}

/* ─── Tailored bullets ───────────────────────────────────────────────────── */

function bulletsAsText(c: TailoredBulletsContent): string {
  const lines: string[] = [];
  if (c.summary) lines.push("SUMMARY", c.summary, "");
  for (const group of c.experience) {
    lines.push(group.heading.toUpperCase());
    for (const b of group.bullets) lines.push(`- ${b.rewritten}`);
    lines.push("");
  }
  if (c.skills_to_emphasize.length) lines.push("SKILLS TO PUT FIRST", c.skills_to_emphasize.join(", "));
  return lines.join("\n").trim();
}

export function BulletsPanel({
  match,
  onGenerated,
  onConflict,
}: {
  match: MatchOut;
  onGenerated: (doc: GeneratedDocumentOut) => void;
  onConflict: () => void;
}) {
  const doc = match.documents.find((d) => d.kind === "tailored_bullets");
  const gen = useGenerate({
    start: () => api.matches.tailoredBullets(match.id),
    onDone: onGenerated,
    onConflict,
  });

  if (!doc) {
    return (
      <div className="max-w-xl space-y-5 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">Reword your bullets for this job</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Rewrites your summary and the bullets that matter most for this posting, using only
            what is already in your resume. It costs nothing and you can do it once per analysis.
          </p>
        </div>
        {gen.working && <StepList heading="Writing" steps={gen.steps} />}
        {gen.error != null && !gen.working && (
          <RequestError error={gen.error} title="The bullets were not written" />
        )}
        <Button onClick={gen.run} disabled={gen.working}>
          <Pencil /> {gen.working ? "Writing" : gen.error != null ? "Try again" : "Write the bullets"}
        </Button>
      </div>
    );
  }

  const c = doc.content as TailoredBulletsContent;
  return (
    <Paper label="Tailored bullets" className="print:break-before-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-2xl font-bold tracking-tight">Tailored bullets</h2>
          <p className="mt-1 font-sans text-sm text-page-muted">
            Written for {match.job_title ?? "this posting"} · {formatDate(doc.created_at)} · from
            your resume only
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={`${paperButton} print:hidden`}
          onClick={() => copy(bulletsAsText(c), "Bullets")}
        >
          <Copy /> Copy all
        </Button>
      </div>

      {c.summary && (
        <Section title="Summary">
          <div className="py-4">
            <p className="max-w-[68ch]">{c.summary}</p>
          </div>
        </Section>
      )}

      {c.experience.map((group, gi) => (
        <Section key={gi} title={group.heading}>
          {group.bullets.map((b, bi) => (
            <div
              key={bi}
              className="grid gap-x-10 gap-y-2 py-4 xl:grid-cols-[minmax(0,1fr)_13rem] print:break-inside-avoid"
            >
              <div className="min-w-0 space-y-2">
                {b.original && (
                  <p className="text-page-muted">
                    <span className="font-sans text-sm font-semibold text-page-foreground">
                      Before{" "}
                    </span>
                    <Marked kind="strike" tone="pencil">{b.original}</Marked>
                  </p>
                )}
                <p>
                  <span className="font-sans text-sm font-semibold text-page-muted">After </span>
                  <span className="font-semibold">{b.rewritten}</span>
                </p>
                {b.why && b.why.length > 60 && (
                  <p className="text-[0.9375rem] leading-relaxed text-page-muted">
                    <span className="font-sans font-semibold text-page-foreground">Why: </span>
                    {b.why}
                  </p>
                )}
              </div>
              {b.why && b.why.length <= 60 && (
                <div className="xl:pt-1">
                  <MarginNote tone="proof" surface="page" className="text-2xl">
                    {b.why.toLowerCase()}
                  </MarginNote>
                </div>
              )}
            </div>
          ))}
        </Section>
      ))}

      {c.skills_to_emphasize.length > 0 && (
        <Section title="Skills to put first">
          <ul className="flex flex-wrap gap-x-6 gap-y-4 py-5">
            {c.skills_to_emphasize.map((s) => (
              <li key={s} className="font-semibold">
                <Marked kind="circle" tone="proof">{s}</Marked>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.notes && (
        <p className="mt-8 border-t border-page-rule pt-5 font-sans text-sm text-page-muted">
          {c.notes}
        </p>
      )}
    </Paper>
  );
}

/* ─── Cover letter ───────────────────────────────────────────────────────── */

function Letter({ content, created }: { content: CoverLetterContent; created: string }) {
  return (
    <Paper label="Cover letter draft" className="print:break-before-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-sans text-sm text-page-muted">Draft · {formatDate(created)}</p>
        <Button
          variant="outline"
          size="sm"
          className={`${paperButton} print:hidden`}
          onClick={() => copy(content.text, "Letter")}
        >
          <Copy /> Copy letter
        </Button>
      </div>
      <div className="mt-6 max-w-[62ch] space-y-4">
        <p>{content.salutation}</p>
        {content.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="pt-2">
          {content.closing}
          <br />
          {content.signature}
        </p>
      </div>
      <p className="mt-10 border-t border-page-rule pt-5 font-sans text-sm text-page-muted">
        A draft written from your resume and this posting. Read it, change what is not you, and
        add the details only you know.
      </p>
    </Paper>
  );
}

export function CoverLetterPanel({
  match,
  onGenerated,
  onConflict,
}: {
  match: MatchOut;
  onGenerated: (doc: GeneratedDocumentOut) => void;
  onConflict: () => void;
}) {
  const { credits, creditBalance } = useDashboardData();
  const drafts = match.documents
    .filter((d) => d.kind === "cover_letter")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const gen = useGenerate({
    start: () => api.matches.coverLetter(match.id),
    onDone: onGenerated,
    onConflict,
  });

  const cost = credits?.costs.cover_letter ?? 1;
  const tooFew = creditBalance !== null && creditBalance < cost;
  const [latest, ...earlier] = drafts;

  return (
    <div className="space-y-8">
      <div className="max-w-xl space-y-5 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">
            {latest ? "Want a different draft?" : "Draft a cover letter"}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            A short letter for this posting, written from your resume. You review and edit it
            before it goes anywhere.
          </p>
        </div>
        <div className="space-y-2">
          <CostLedger
            rows={[{ label: latest ? "Another draft" : "One draft", amount: -cost }]}
            balance={creditBalance}
          />
          <p className="text-sm text-muted-foreground">
            {plural(cost, "credit")} is returned if the draft fails.
          </p>
        </div>
        {tooFew && !gen.working && <NoCredits needed={cost} balance={creditBalance} />}
        {gen.working && <StepList heading="Writing the letter" steps={gen.steps} />}
        {gen.error != null && !gen.working && (
          <RequestError error={gen.error} title="The letter was not written" />
        )}
        <Button onClick={gen.run} disabled={gen.working || tooFew}>
          {gen.working
            ? "Writing"
            : `${latest ? "Draft another" : "Draft the letter"} (${plural(cost, "credit")})`}
        </Button>
      </div>

      {latest && <Letter content={latest.content as CoverLetterContent} created={latest.created_at} />}

      {earlier.length > 0 && (
        <details className="print:hidden">
          <summary className="cursor-pointer text-sm font-semibold">
            {plural(earlier.length, "earlier draft")}
          </summary>
          <div className="mt-4 space-y-6">
            {earlier.map((d) => (
              <Letter key={d.id} content={d.content as CoverLetterContent} created={d.created_at} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
