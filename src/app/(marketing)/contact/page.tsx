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
        <section className="px-4 py-16 sm:py-24">
          <div className="container mx-auto max-w-2xl">
            <div className="mb-10 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Contact
              </p>
              <h1
                className="mt-3 text-3xl tracking-tight sm:text-4xl"
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontStyle: "italic",
                }}
              >
                Get in touch
              </h1>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Have a question, found a bug, or want to talk pricing? Send us a
                message — we read everything.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <ContactForm initialSuccess={!!sent} initialError={initialError} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
