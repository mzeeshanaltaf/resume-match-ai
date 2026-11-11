"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

type Props = {
  initialSuccess?: boolean;
  initialError?: string;
};

export function ContactForm({ initialSuccess = false, initialError }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot value. Kept in state so the hydrated React submit forwards it too.
  // The field name is deliberately non-semantic ("hp_field") so browser/Google
  // autofill does not recognise it as a real field and pre-populate it.
  const [hpField, setHpField] = useState("");

  const [status, setStatus] = useState<Status>(
    initialSuccess ? "success" : initialError ? "error" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState(initialError ?? "");

  // When React is hydrated, onSubmit intercepts and uses fetch (enhanced UX).
  // When hydration fails, the native action="/api/contact" POST fires instead.
  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus("error");
      setErrorMsg("Please fill in all fields.");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, hp_field: hpField }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(data.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Failed to send. Check your connection and try again.");
    }
  };

  if (status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-3 py-4"
      >
        <CheckCircle2 aria-hidden className="h-6 w-6 text-proof" />
        <h2 className="text-2xl font-bold tracking-tight">Message sent</h2>
        <p className="max-w-sm leading-relaxed text-muted-foreground">
          Thanks for writing. We read every message and will reply as soon as
          we can.
        </p>
        <button
          type="button"
          onClick={() => {
            setName("");
            setEmail("");
            setMessage("");
            setStatus("idle");
          }}
          className="mt-1 rounded-sm text-sm font-semibold underline underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      action="/api/contact"
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      {/* Honeypot: visually hidden, off the a11y tree, off the tab order, and
          autocomplete disabled. Real users never see or fill it; bots that
          auto-fill every input get flagged server-side. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="hp_field">Leave this field empty</label>
        <input
          id="hp_field"
          name="hp_field"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hpField}
          onChange={(e) => setHpField(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-semibold">
          Name
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="message" className="text-sm font-semibold">
            Message
          </label>
          <span className="text-xs text-muted-foreground">
            {message.length}/1000
          </span>
        </div>
        <Textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={1000}
          placeholder="How can we help you?"
          className="resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {status === "error" && (
        <p
          className="rounded-md bg-pencil-wash px-3.5 py-2.5 text-sm font-medium text-pencil"
          role="alert"
        >
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        disabled={status === "loading"}
        className="group gap-2 self-start"
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        )}
        {status === "loading" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
