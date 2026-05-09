import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ResuMatchAI Privacy Policy — how we collect, use, and protect your data.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  {
    title: "1. Information we collect",
    body: [
      "When you create an account, we collect your name and email address via our authentication provider (Clerk). We do not store your password directly.",
      "When you use our resume matching features, your uploaded resume is temporarily processed by our AI pipeline to generate a match report. Resume content is not stored permanently on our servers.",
      "We collect standard usage data such as pages visited, features used, and error logs to improve the service. This data is aggregated and not linked to personally identifiable information.",
    ],
  },
  {
    title: "2. How we use your information",
    body: [
      "To provide and improve the ResuMatchAI service, including generating match reports and recommendations.",
      "To manage your account, process credits, and send transactional emails (e.g. password resets, billing notifications).",
      "To analyse usage patterns in aggregate to inform product decisions. We do not sell your personal data to third parties.",
    ],
  },
  {
    title: "3. Data retention",
    body: [
      "Account data (name, email) is retained for as long as your account is active. You may request deletion at any time by contacting us.",
      "Resume files submitted for analysis are processed in memory and are not persisted beyond the duration of a single analysis session.",
      "Match history and analytics stored in your dashboard are retained indefinitely while your account is active, and deleted within 30 days of account closure.",
    ],
  },
  {
    title: "4. Third-party services",
    body: [
      "We use Clerk for authentication and identity management. Clerk's privacy policy applies to data processed through their platform.",
      "Our AI processing pipeline is powered by n8n workflows running on infrastructure we control. No resume data is shared with external AI providers without your knowledge.",
      "We do not use third-party advertising networks or tracking pixels.",
    ],
  },
  {
    title: "5. Cookies",
    body: [
      "We use strictly necessary session cookies to keep you logged in. We do not use tracking cookies or third-party marketing cookies.",
      "You can disable cookies in your browser settings, but this may prevent you from logging in to the application.",
    ],
  },
  {
    title: "6. Your rights",
    body: [
      "You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us using the link in the footer.",
      "If you are located in the European Economic Area, you have rights under GDPR including the right to data portability and the right to object to processing.",
      "We will respond to all privacy-related requests within 30 days.",
    ],
  },
  {
    title: "7. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by displaying a notice in the application. Continued use of the service after changes constitutes acceptance of the updated policy.",
      "This policy was last updated on 9 March 2026.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-border/50 px-4 py-16 md:py-20">
          <div className="container mx-auto max-w-3xl">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Legal
            </p>
            <h1
              className="mt-4 text-4xl tracking-tight md:text-5xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              Privacy Policy
            </h1>
            <p className="mt-4 text-muted-foreground">
              Last updated: 9 March 2026
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              ResuMatchAI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
              protecting your privacy. This policy explains what data we collect, how we use it,
              and your rights in relation to it.
            </p>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="container mx-auto max-w-3xl space-y-12">
            {sections.map(({ title, body }) => (
              <div key={title}>
                <h2 className="text-xl font-semibold">{title}</h2>
                <div className="mt-4 space-y-3">
                  {body.map((paragraph, i) => (
                    <p key={i} className="leading-relaxed text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-muted/30 p-6">
              <p className="font-semibold">Contact us about privacy</p>
              <p className="mt-2 text-sm text-muted-foreground">
                If you have questions about this Privacy Policy or want to exercise your rights,
                use the Contact link in the footer or email us directly.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
