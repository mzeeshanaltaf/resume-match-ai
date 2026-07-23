import Link from "next/link";
import { FileText } from "lucide-react";

const links = {
  Product: [
    ["Features", "/#features"],
    ["Pricing", "/#pricing"],
    ["How it works", "/#how-it-works"],
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
    <footer className="border-t border-border/50 bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10">
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-semibold">ResuMatchAI</span>
            </Link>
            <p className="mt-3 max-w-52 text-sm leading-relaxed text-muted-foreground">
              AI-powered resume matching for modern job seekers. Know your fit score before you apply.
            </p>
            <p className="mt-5 font-mono text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} ResuMatchAI
            </p>
          </div>

          {/* Link columns */}
          {(Object.entries(links) as [string, readonly (readonly [string, string])[]][]).map(
            ([section, items]) => (
              <div key={section}>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {section}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {items.map(([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      </div>
    </footer>
  );
}
