import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

export interface LegalSection {
  title: string;
  body: string[];
}

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Long-reading layout shared by the privacy policy and the terms: a document
 * set in the book serif, with a section list beside it on large screens.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  closing,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  closing: { title: string; body: React.ReactNode };
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <header className="border-b border-border px-4 py-14 sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-[clamp(2.25rem,1.2rem+3vw,3.75rem)] font-bold leading-[1.04] tracking-[-0.025em]">
              {title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}</p>
            <p className="mt-5 max-w-[40rem] font-serif text-[1.0625rem] leading-[1.75] text-muted-foreground">
              {intro}
            </p>
          </div>
        </header>

        <div className="px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-20">
            <nav aria-label={`${title} sections`} className="hidden lg:block">
              <ol className="sticky top-24 space-y-1 text-sm">
                {sections.map(({ title: t }) => (
                  <li key={t}>
                    <a
                      href={`#${slug(t)}`}
                      className="block rounded-sm py-1 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      {t}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="max-w-[44rem] space-y-12">
              {sections.map(({ title: t, body }) => (
                <section key={t} id={slug(t)} className="scroll-mt-24">
                  <h2 className="text-xl font-bold tracking-tight">{t}</h2>
                  <div className="mt-4 space-y-4 font-serif text-[1.0625rem] leading-[1.75] text-foreground/85">
                    {body.map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}

              <section className="border-t border-border pt-8">
                <h2 className="text-xl font-bold tracking-tight">{closing.title}</h2>
                <div className="mt-3 font-serif text-[1.0625rem] leading-[1.75] text-foreground/85">
                  {closing.body}
                </div>
                <p className="mt-4">
                  <Link
                    href="/contact"
                    className="font-semibold underline underline-offset-4 decoration-1 hover:decoration-2"
                  >
                    Contact us
                  </Link>
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
