import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

const links = {
  Product: [
    ["How it works", "/#desks"],
    ["Sample report", "/#report"],
    ["Credits", "/#credits"],
    ["FAQ", "/#faq"],
  ],
  Company: [
    ["About", "/about"],
    ["Contact", "/contact"],
  ],
  Legal: [
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
  ],
} as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_2fr] md:gap-16">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A close read of a resume against a job posting, with the reasons
              written down.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {(Object.entries(links) as [string, readonly (readonly [string, string])[]][]).map(
              ([section, items]) => (
                <div key={section}>
                  <p className="text-sm font-semibold">{section}</p>
                  <ul className="mt-3 space-y-1">
                    {items.map(([label, href]) => (
                      <li key={label}>
                        <Link
                          href={href}
                          className="inline-flex min-h-8 items-center rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ResuMatchAI</p>
          <p>Scores are a model&apos;s judgment, not an applicant-tracking-system result.</p>
        </div>
      </div>
    </footer>
  );
}
