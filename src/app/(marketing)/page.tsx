import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { ContactDialog } from "@/components/marketing/contact-dialog";
import {
  ArrowRight,
  Check,
  FileText,
  Target,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AI Resume Matcher — Score Your Resume Against Any Job",
  description:
    "Get an instant match score, keyword gaps, and rewrite suggestions for any job posting. Beat the ATS and land more interviews with ResuMatchAI.",
  alternates: { canonical: "/" },
};

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ResuMatchAI",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered resume analysis and job matching. Upload your resume, paste a job description, and get an instant match score with personalised recommendations.",
  url: "https://resumatch.zeeshanai.cloud",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "5 resume analyses per month, basic match score, PDF export",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "12",
      priceCurrency: "USD",
      description:
        "Unlimited analyses, detailed gap analysis, keyword recommendations, cover letter drafts, priority support",
    },
  ],
};

/* ─── Animation styles (CSS-only, server-component safe) ───────────── */
const animStyles = `
  @keyframes ring-progress {
    from { stroke-dashoffset: 314; }
    to   { stroke-dashoffset: 19;  }
  }
  .score-ring {
    stroke-dasharray: 314;
    stroke-dashoffset: 314;
    animation: ring-progress 1.6s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
  }
  @keyframes score-pop {
    from { opacity: 0; transform: scale(0.8); }
    to   { opacity: 1; transform: scale(1);   }
  }
  .score-appear { opacity: 0; animation: score-pop 0.4s ease-out 1.4s forwards; }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .au-1 { opacity: 0; animation: fade-up 0.55s ease-out 0.05s forwards; }
  .au-2 { opacity: 0; animation: fade-up 0.55s ease-out 0.15s forwards; }
  .au-3 { opacity: 0; animation: fade-up 0.55s ease-out 0.25s forwards; }
  .au-4 { opacity: 0; animation: fade-up 0.55s ease-out 0.35s forwards; }
  .au-5 { opacity: 0; animation: fade-up 0.55s ease-out 0.45s forwards; }
  .au-6 { opacity: 0; animation: fade-up 0.55s ease-out 0.20s forwards; }
`;

/* ─── Data ─────────────────────────────────────────────────────────── */
const matchedKeywords = ["React.js", "TypeScript", "Team Leadership", "Communication"];
const missingKeywords = ["GraphQL", "System Design"];

const features = [
  {
    icon: FileText,
    num: "01",
    title: "Smart Resume Analysis",
    metric: "98% accuracy",
    description:
      "Upload your resume and our AI extracts skills, experience, and achievements with pinpoint accuracy.",
  },
  {
    icon: Target,
    num: "02",
    title: "Job Description Matching",
    metric: "< 30 seconds",
    description:
      "Paste any job description and get an instant match score with gap analysis highlighting what recruiters want.",
  },
  {
    icon: Zap,
    num: "03",
    title: "Tailored Recommendations",
    metric: "10+ suggestions",
    description:
      "Receive specific, actionable rewrites for your resume tailored to every unique role you apply for.",
  },
];

const steps = [
  {
    num: "01",
    title: "Upload Your Resume",
    description:
      "Drop your resume in PDF or Word format. We parse it instantly with zero data retention.",
  },
  {
    num: "02",
    title: "Paste a Job Description",
    description:
      "Copy the job listing URL. Our AI scrapes and structures the requirements automatically.",
  },
  {
    num: "03",
    title: "Get Your Match Report",
    description:
      "Receive a detailed score, keyword gaps, and actionable rewrite suggestions in seconds.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "For occasional job seekers",
    features: ["5 resume analyses / month", "Basic match score", "PDF export"],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/ month",
    desc: "For active job seekers",
    features: [
      "Unlimited analyses",
      "Detailed gap analysis",
      "Keyword recommendations",
      "Cover letter drafts",
      "Priority support",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    desc: "For teams and agencies",
    features: [
      "Everything in Pro",
      "Bulk analysis",
      "API access",
      "Custom integrations",
      "Dedicated account manager",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

/* ─── Page ─────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <style>{animStyles}</style>
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-4 py-20 md:py-28 lg:py-36">
          {/* Subtle dot grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="container relative mx-auto max-w-6xl">
            <div className="grid items-center gap-14 lg:grid-cols-[1fr_460px]">

              {/* Left: copy */}
              <div>
                <div className="au-1">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    AI-Powered Resume Matching
                  </span>
                </div>

                <h1
                  className="au-2 mt-5 text-5xl leading-[1.08] tracking-tight md:text-6xl lg:text-[4.5rem]"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Land interviews,
                  <br />
                  <span className="text-emerald-600 dark:text-emerald-400">not rejection</span> emails.
                </h1>

                <p className="au-3 mt-6 max-w-120 text-lg leading-relaxed text-muted-foreground">
                  ResuMatchAI scores your resume against any job description
                  and tells you exactly what to fix — before you click apply.
                </p>

                <div className="au-4 mt-8 flex flex-wrap items-center gap-3">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button
                        size="lg"
                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-slate-950"
                      >
                        Start for free <ArrowRight className="h-4 w-4" />
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button
                      asChild
                      size="lg"
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Link href="/dashboard">
                        Go to Dashboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SignedIn>
                  <Button variant="outline" size="lg" asChild>
                    <Link href="#how-it-works">See how it works</Link>
                  </Button>
                </div>

                <p className="au-5 mt-5 text-xs text-muted-foreground">
                  No credit card required · 5 free analyses monthly · Cancel anytime
                </p>
              </div>

              {/* Right: animated match report card */}
              <div className="au-6">
                <div className="relative">
                  {/* Ambient glow */}
                  <div className="absolute -inset-6 rounded-3xl bg-emerald-500/10 blur-3xl dark:bg-emerald-500/8" />

                  <div className="relative rounded-2xl border border-border bg-card p-6 shadow-2xl">
                    {/* Card header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Match Report
                        </p>
                        <p className="mt-1 text-sm font-semibold">Senior Frontend Engineer</p>
                        <p className="text-xs text-muted-foreground">Acme Corp · Remote</p>
                      </div>
                      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Analyzing
                      </span>
                    </div>

                    {/* Score ring */}
                    <div className="my-6 flex items-center justify-center">
                      <div className="relative h-40 w-40">
                        <svg viewBox="0 0 120 120" className="h-full w-full">
                          {/* Track */}
                          <circle
                            cx="60" cy="60" r="50"
                            fill="none" strokeWidth="8"
                            stroke="currentColor"
                            className="text-muted/40"
                          />
                          {/* Progress — starts at top via SVG transform */}
                          <circle
                            cx="60" cy="60" r="50"
                            fill="none" strokeWidth="8"
                            stroke="#10b981"
                            strokeLinecap="round"
                            transform="rotate(-90 60 60)"
                            className="score-ring"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center score-appear">
                          <span className="font-mono text-4xl font-bold leading-none tabular-nums">94</span>
                          <span className="font-mono text-xs text-muted-foreground">% match</span>
                          <span className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Excellent
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Keyword analysis */}
                    <div className="border-t border-border pt-4">
                      <p className="mb-3 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Keyword Analysis
                      </p>
                      <div className="space-y-1.5">
                        {matchedKeywords.map((kw) => (
                          <div
                            key={kw}
                            className="flex items-center justify-between rounded-md bg-emerald-500/6 px-3 py-2"
                          >
                            <span className="text-sm">{kw}</span>
                            <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              ✓ Match
                            </span>
                          </div>
                        ))}
                        {missingKeywords.map((kw) => (
                          <div
                            key={kw}
                            className="flex items-center justify-between rounded-md bg-destructive/6 px-3 py-2"
                          >
                            <span className="text-sm text-muted-foreground">{kw}</span>
                            <span className="font-mono text-[10px] font-semibold text-destructive">
                              ✗ Gap
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────── */}
        <section id="features" className="border-y border-border bg-muted/20 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Features
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Everything you need to stand out
              </h2>
              <p className="mt-3 max-w-md mx-auto text-muted-foreground">
                Our AI does the heavy lifting so you can focus on getting interviews.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {features.map(({ icon: Icon, num, title, metric, description }) => (
                <div
                  key={title}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:border-emerald-500/30 hover:shadow-md"
                >
                  {/* Background step number */}
                  <span
                    className="pointer-events-none absolute right-3 top-2 select-none font-mono text-8xl font-bold leading-none text-muted-foreground/10"
                    aria-hidden
                  >
                    {num}
                  </span>

                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="mt-4 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {metric}
                    </p>
                    <h3 className="mt-1 font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ──────────────────────────────────────────── */}
        <section id="how-it-works" className="px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                How it works
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Three steps to your match report
              </h2>
              <p className="mt-3 text-muted-foreground">
                From upload to insights in under 60 seconds.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {steps.map(({ num, title, description }, i) => (
                <div key={num} className="relative flex flex-col items-center px-4 text-center">
                  {/* Connector */}
                  {i < steps.length - 1 && (
                    <div className="absolute left-[calc(50%+2.5rem)] top-8 hidden h-px w-[calc(100%-5rem)] border-t border-dashed border-border md:block" />
                  )}

                  {/* Step circle */}
                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/30 bg-emerald-500/8">
                    <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {num}
                    </span>
                  </div>

                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────── */}
        <section id="pricing" className="border-y border-border bg-muted/20 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pricing
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Simple, transparent pricing
              </h2>
              <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need more.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 md:items-start">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-xl border p-6 ${
                    plan.highlight
                      ? "border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/20"
                      : "border-border bg-card"
                  }`}
                >
                  {plan.highlight && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-emerald-500/4" />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-amber-500 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                          Coming Soon
                        </span>
                      </div>
                    </>
                  )}

                  <div className="relative">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {plan.name}
                    </p>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>

                    <ul className="mt-6 space-y-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm">
                          <Check
                            className={`h-4 w-4 shrink-0 ${
                              plan.highlight ? "text-emerald-500" : "text-muted-foreground"
                            }`}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8">
                      {plan.name === "Enterprise" ? (
                        <ContactDialog
                          triggerLabel="Contact sales"
                          triggerClassName="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        />
                      ) : plan.name === "Pro" ? (
                        <Button className="w-full" variant="outline" disabled>
                          Coming Soon
                        </Button>
                      ) : (
                        <>
                          <SignedOut>
                            <SignInButton mode="modal">
                              <Button className="w-full" variant="outline">
                                {plan.cta}
                              </Button>
                            </SignInButton>
                          </SignedOut>
                          <SignedIn>
                            <Button asChild className="w-full" variant="outline">
                              <Link href="/dashboard">{plan.cta}</Link>
                            </Button>
                          </SignedIn>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ────────────────────────────────────────────── */}
        <section className="px-4 py-20">
          <div className="container mx-auto max-w-4xl">
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 px-8 py-16 text-center dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
              {/* Grid overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)",
                  backgroundSize: "36px 36px",
                }}
              />
              {/* Glow */}
              <div className="pointer-events-none absolute inset-x-0 -top-24 flex justify-center">
                <div className="h-48 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
              </div>

              <div className="relative">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                  Ready to get started?
                </p>
                <h2
                  className="mt-4 text-3xl text-white md:text-4xl"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Stop guessing. Start matching.
                </h2>
                <p className="mt-4 text-slate-400">
                  Join thousands of job seekers already using AI to get ahead.
                  <br className="hidden sm:block" />
                  Your first 5 analyses are completely free.
                </p>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button
                        size="lg"
                        className="gap-2 bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        Get started for free <ArrowRight className="h-4 w-4" />
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button
                      asChild
                      size="lg"
                      className="gap-2 bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <Link href="/dashboard">
                        Go to Dashboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SignedIn>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    asChild
                  >
                    <Link href="#pricing">View pricing</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
