"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";

interface ContactDialogProps {
  triggerLabel?: string;
  triggerClassName?: string;
}

export function ContactDialog({
  triggerLabel = "Contact",
  triggerClassName = "text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer",
}: ContactDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaSeed, setCaptchaSeed] = useState(0);

  const captcha = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _seed = captchaSeed; // dependency to regenerate
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, [captchaSeed]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (parseInt(captchaAnswer, 10) !== captcha.answer) {
      toast.error("Incorrect answer. Please try again.");
      setCaptchaAnswer("");
      setCaptchaSeed((s) => s + 1);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSubmitted(true);
    } catch {
      toast.error("Failed to send your message. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setTimeout(() => {
        setSubmitted(false);
        setName("");
        setEmail("");
        setMessage("");
        setCaptchaAnswer("");
        setCaptchaSeed((s) => s + 1);
      }, 300);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {submitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <DialogTitle className="text-lg font-semibold">
                Thank you for contacting us!
              </DialogTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                We will get back to you as soon as possible.
              </p>
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Get in touch</DialogTitle>
                <DialogDescription>
                  Send us a message and we&apos;ll respond as soon as possible.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="contact-name"
                      className="text-sm font-medium"
                    >
                      Name
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {name.length}/30
                    </span>
                  </div>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    maxLength={30}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-email"
                    className="text-sm font-medium"
                  >
                    Email
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="contact-message"
                      className="text-sm font-medium"
                    >
                      Message
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {message.length}/1000
                    </span>
                  </div>
                  <Textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How can we help you?"
                    rows={4}
                    maxLength={1000}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-captcha"
                    className="text-sm font-medium"
                  >
                    What is {captcha.a} + {captcha.b}?
                  </label>
                  <Input
                    id="contact-captcha"
                    type="text"
                    inputMode="numeric"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Your answer"
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !name.trim() || !email.trim() || !message.trim() || !captchaAnswer.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                  >
                    {loading ? "Sending…" : "Send Message"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
