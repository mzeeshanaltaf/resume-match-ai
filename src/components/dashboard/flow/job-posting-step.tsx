"use client";

import { useId } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_JD_CHARS } from "@/lib/api/limits";
import { cn } from "@/lib/utils";
import { StepList } from "@/components/dashboard/step-list";
import { RequestError } from "@/components/dashboard/notes";
import type { JobPostingState, PostingKind } from "./use-job-posting";

const KINDS: { value: PostingKind; label: string }[] = [
  { value: "url", label: "Link" },
  { value: "text", label: "Paste text" },
];

/** Step 2 of both flows: a link to the posting, or its pasted text. */
export function JobPostingStep({
  posting,
  intro,
  onBack,
  onAdded,
}: {
  posting: JobPostingState;
  intro: string;
  onBack: () => void;
  /** Called with the stored posting's id. */
  onAdded: (jdId: string) => void;
}) {
  const urlId = useId();
  const textId = useId();
  const hintId = useId();
  const groupName = useId();
  const { kind, working } = posting;

  async function add() {
    const id = await posting.submit();
    if (id) onAdded(id);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (posting.canSubmit) add();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Add the job posting</h2>
        <p className="mt-1 text-base text-muted-foreground">{intro}</p>
      </div>

      {/* Two native radios styled as a segmented control: nothing to build, keyboard works. */}
      <fieldset disabled={working}>
        <legend className="sr-only">How to add the posting</legend>
        <div className="inline-flex rounded-md border border-input bg-card p-0.5">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={cn(
                "flex min-h-10 cursor-pointer items-center rounded-sm px-4 text-sm font-semibold transition-colors duration-150 md:min-h-8",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                kind === k.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={k.value}
                checked={kind === k.value}
                onChange={() => posting.setKind(k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "url" ? (
        <div className="space-y-2">
          <label htmlFor={urlId} className="text-sm font-semibold">
            Link to the posting
          </label>
          <Input
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://company.com/careers/product-analyst"
            value={posting.url}
            onChange={(e) => posting.setUrl(e.target.value)}
            disabled={working}
            aria-invalid={!!posting.problem}
            aria-describedby={hintId}
            className="max-w-xl"
          />
          <p id={hintId} className="max-w-xl text-sm text-muted-foreground">
            We read the page for you. Some sites block that; if yours does, switch to
            &ldquo;Paste text&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor={textId} className="text-sm font-semibold">
            Text of the posting
          </label>
          <Textarea
            id={textId}
            rows={9}
            placeholder="Paste the responsibilities and requirements here"
            value={posting.text}
            onChange={(e) => posting.setText(e.target.value)}
            disabled={working}
            aria-invalid={!!posting.problem}
            aria-describedby={hintId}
            className="max-w-xl"
          />
          <p
            id={hintId}
            className={cn(
              "max-w-xl text-sm",
              posting.text.trim().length > MAX_JD_CHARS ? "text-pencil" : "text-muted-foreground",
            )}
          >
            {posting.text.trim().length.toLocaleString()} of {MAX_JD_CHARS.toLocaleString()}{" "}
            characters.
          </p>
        </div>
      )}

      {posting.problem && (
        <p role="alert" className="max-w-xl text-sm font-medium text-pencil">
          {posting.problem}
        </p>
      )}

      {working && <StepList heading="Reading the posting" steps={posting.steps} className="max-w-xl" />}

      {posting.error != null && !working && (
        <RequestError
          error={posting.error}
          title="The posting was not added"
          fallback="The posting could not be added."
          className="max-w-xl"
        />
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onBack} disabled={working}>
          <ArrowLeft /> Back
        </Button>
        <Button type="submit" disabled={!posting.canSubmit}>
          {working ? "Adding" : "Add posting"}
        </Button>
      </div>
    </form>
  );
}
