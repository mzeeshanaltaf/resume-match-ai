import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the ResuMatchAI team. Ask a question, report a bug, or suggest a feature.",
  alternates: { canonical: "/contact" },
};

// Short error codes set by the API route's redirect (?error=...) mapped to
// human-readable copy. Keep keys in sync with the route handler's fail() calls.
const ERROR_MESSAGES: Record<string, string> = {
  fields: "Please fill in all fields.",
  email: "Please enter a valid email address.",
  length: "Message must be 1000 characters or fewer.",
  rate: "Too many submissions. Please try again later.",
  server: "Service is temporarily unavailable. Please try again later.",
  parse: "Invalid submission. Please try again.",
};

type Props = {
  searchParams: Promise<{ sent?: string; error?: string }>;
};

export default async function ContactPage({ searchParams }: Props) {
  const { sent, error } = await searchParams;
  const initialError = error
    ? ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."
    : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="px-4 py-14 sm:px-6 md:py-24 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
            <div>
              <h1 className="max-w-[12ch] text-[clamp(2.25rem,1.2rem+3vw,3.75rem)] font-bold leading-[1.04] tracking-[-0.025em] text-balance">
                Write to us.
              </h1>
              <p className="mt-5 max-w-[26rem] leading-relaxed text-muted-foreground">
                A question, a bug, a score that looks wrong, a feature you
                want. A person reads every message.
              </p>
              <p className="mt-4 max-w-[26rem] text-sm leading-relaxed text-muted-foreground">
                Your name, email and message are forwarded to us so we can
                reply.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
              <ContactForm initialSuccess={!!sent} initialError={initialError} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
