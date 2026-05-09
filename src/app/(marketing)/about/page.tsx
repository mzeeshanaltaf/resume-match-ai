import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { FileText, Target, Zap, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about ResuMatchAI — our mission to help job seekers land more interviews with AI-powered resume matching.",
  alternates: { canonical: "/about" },
};

const values = [
  {
    icon: Target,
    title: "Precision over guesswork",
    description:
      "We believe job seekers deserve to know exactly how their resume stacks up before they apply. No more hoping for the best.",
  },
  {
    icon: Zap,
    title: "Speed that respects your time",
    description:
      "A full match report in under 60 seconds. Because your job search moves fast and your tools should too.",
  },
  {
    icon: Shield,
    title: "Privacy by design",
    description:
      "Your resume is analysed and discarded. We never store, sell, or share your personal data with third parties.",
  },
  {
    icon: FileText,
    title: "Actionable, not generic",
    description:
      "Every recommendation is tailored to the specific job description you submit — not recycled advice from a template.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/50 px-4 py-20 md:py-28">
          <div className="container mx-auto max-w-6xl">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              About us
            </p>
            <h1
              className="mt-4 max-w-3xl text-4xl tracking-tight md:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              Built for job seekers who want an{" "}
              <span className="text-emerald-600 dark:text-emerald-400">unfair advantage</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              ResuMatchAI was born out of frustration. Hundreds of applications, a handful of
              callbacks, and no clear reason why. We built the tool we wished we had — one that
              tells you exactly what recruiters and ATS systems are looking for, before you click
              send.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="grid gap-16 md:grid-cols-2 md:items-center">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Our mission
                </p>
                <h2
                  className="mt-4 text-3xl tracking-tight md:text-4xl"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Close the gap between talent and opportunity
                </h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Every day, qualified candidates miss out on roles they&apos;re perfect for — not
                  because they lack skill, but because their resume doesn&apos;t speak the
                  language of the job description. ResuMatchAI bridges that gap.
                </p>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Our AI analyses the specific requirements of each job you target, scores your
                  resume against them, and gives you a concrete list of improvements. Not generic
                  career advice — targeted, role-specific guidance.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-8">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    ["98%", "Resume parse accuracy"],
                    ["< 30s", "Time to match report"],
                    ["10+", "Actionable suggestions"],
                    ["5", "Free analyses / month"],
                  ].map(([stat, label]) => (
                    <div key={label}>
                      <p className="font-mono text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        {stat}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="border-t border-border bg-muted/20 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Our values
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                What we stand for
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {values.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
