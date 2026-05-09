# Plan: SEO Improvements for ResuMatchAI

## Context

ResuMatchAI is a Next.js 16 (App Router) marketing + auth-protected dashboard at https://resumatch.zeeshanai.cloud. The marketing pages (`/`, `/about`, `/privacy`, `/terms`) are public and meant to rank in search; the `/dashboard/*` routes are Clerk-protected and should not be indexed.

Audit (via `seo-audit` skill framework) found that the **on-page foundations are solid** — clean H1/H2 hierarchy, semantic HTML, internal links via `next/link`, descriptive copy with target keywords (resume matching, ATS, job description, match score, AI-powered) — but the site is missing **every piece of SEO infrastructure that lives outside the page body**: no robots.txt, no sitemap, no favicon, no Open Graph image, no JSON-LD structured data, no PWA manifest, and the landing page itself has no explicit metadata (it inherits the root only). These gaps prevent Google from crawling efficiently, suppress rich social previews, and weaken AI-search eligibility.

The goal is to ship a complete SEO baseline so the site can be indexed, shared, and surfaced in AI Overviews / SGE without code-level rewrites.

---

## What's Already Good (Do Not Touch)

- Root metadata in [src/app/layout.tsx](src/app/layout.tsx) — title template, description, OG, Twitter, robots, `metadataBase`
- Per-page metadata on `/about`, `/privacy`, `/terms`
- One H1 per page, clean H2/H3 hierarchy across marketing pages
- Semantic `<main>`, `<header>`, `<footer>`, `<section>`
- Security headers in [next.config.ts](next.config.ts)
- `next/font` for both Geist and DM Serif Display (no FOUT)
- Middleware correctly leaves marketing pages public, protects `/dashboard/*`

---

## Phase 1 — Critical Crawlability Fixes (must ship first)

### 1.1 Add robots.txt — `src/app/robots.ts`

Use Next.js [Metadata Files API](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) (file-based convention). Allow all marketing routes; disallow `/dashboard/*`, `/api/*`, `/sign-in`, `/sign-up`. Reference the sitemap.

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard/", "/api/", "/sign-in", "/sign-up"] },
    ],
    sitemap: "https://resumatch.zeeshanai.cloud/sitemap.xml",
    host: "https://resumatch.zeeshanai.cloud",
  };
}
```

### 1.2 Add sitemap.xml — `src/app/sitemap.ts`

Static sitemap covering only public canonical URLs: `/`, `/about`, `/privacy`, `/terms`. `lastModified: new Date()`. Use `MetadataRoute.Sitemap`.

### 1.3 Add favicon + app icons — `src/app/`

- `src/app/icon.png` (32×32 or 256×256) — auto-served as `/icon.png`
- `src/app/apple-icon.png` (180×180) — auto-served as `/apple-icon.png`
- Optionally `src/app/favicon.ico` for legacy compatibility

User must supply the source brand mark; Next.js auto-injects the `<link rel="icon">` tags.

### 1.4 Add explicit metadata to landing page — `src/app/(marketing)/page.tsx`

Currently inherits from root. Add a focused `export const metadata` with a keyword-rich title and description targeting the primary money phrases ("AI resume matcher", "job match score", "ATS resume check"). Example:

```ts
export const metadata: Metadata = {
  title: "AI Resume Matcher — Score Your Resume Against Any Job",
  description: "Get an instant match score, keyword gaps, and rewrite suggestions for any job posting. Beat the ATS and land more interviews with ResuMatchAI.",
  alternates: { canonical: "/" },
};
```

Add explicit `alternates.canonical` to all four marketing pages (root, `/about`, `/privacy`, `/terms`) so Google has a clear self-canonical signal.

---

## Phase 2 — Social & Brand Presence

### 2.1 Open Graph image — `src/app/opengraph-image.tsx`

Use Next.js [generated OG image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) (1200×630). Render with `ImageResponse` from `next/og`: brand name, tagline ("AI Resume Matcher"), emerald accent matching the existing landing-page palette. Auto-served and auto-referenced in OG metadata.

Also add `src/app/twitter-image.tsx` (or alias the OG one).

### 2.2 PWA manifest — `src/app/manifest.ts`

Minimal `MetadataRoute.Manifest` — name, short_name, theme_color (slate-950), background_color, icons array pointing at the icons added in 1.3. Improves "Add to Home Screen" and crawler signals.

---

## Phase 3 — Structured Data (JSON-LD)

Add JSON-LD via inline `<script type="application/ld+json">` (server-rendered — must appear in initial HTML, not injected client-side).

### 3.1 Organization schema — root layout

In [src/app/layout.tsx](src/app/layout.tsx), inject an `Organization` JSON-LD block with name, url, logo, sameAs (empty array for now or social links if any).

### 3.2 SoftwareApplication / WebApplication schema — landing page

In [src/app/(marketing)/page.tsx](src/app/(marketing)/page.tsx), inject `SoftwareApplication` JSON-LD: `applicationCategory: "BusinessApplication"`, `name`, `description`, `offers` (free + paid tiers reflecting the existing pricing section), `aggregateRating` only if real ratings exist (omit otherwise — fake ratings are a manual-action risk).

### 3.3 FAQ schema — optional, only if FAQ section is added later

Skip for now since the landing page has no FAQ section.

Helper pattern (avoid duplicating the `<script>` boilerplate):

```tsx
function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

---

## Phase 4 — Performance & Verify

### 4.1 Run PageSpeed Insights against production

Run https://pagespeed.web.dev/ on `https://resumatch.zeeshanai.cloud` after Phase 1 ships. Targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. The site has no `<img>` (pure SVG + Lucide icons + `next/font`), so LCP should already be strong, but verify and address any flagged issues.

### 4.2 Validate structured data

After Phase 3, run https://search.google.com/test/rich-results against each marketing URL. Confirm Organization and SoftwareApplication parse without errors.

### 4.3 Search Console + Bing Webmaster Tools

User action (not code):
- Verify domain ownership in Google Search Console
- Submit `https://resumatch.zeeshanai.cloud/sitemap.xml`
- Repeat in Bing Webmaster Tools

---

## Files to Create

| Path | Purpose |
|---|---|
| `src/app/robots.ts` | Crawl directives + sitemap reference |
| `src/app/sitemap.ts` | XML sitemap of public URLs |
| `src/app/icon.png` | Favicon (Next.js auto-serves) |
| `src/app/apple-icon.png` | iOS home-screen icon |
| `src/app/opengraph-image.tsx` | Generated 1200×630 OG image |
| `src/app/twitter-image.tsx` | Generated Twitter card image (or re-export OG) |
| `src/app/manifest.ts` | PWA web manifest |

## Files to Modify

| Path | Change |
|---|---|
| [src/app/layout.tsx](src/app/layout.tsx) | Inject Organization JSON-LD |
| [src/app/(marketing)/page.tsx](src/app/(marketing)/page.tsx) | Add `export const metadata` with canonical; inject SoftwareApplication JSON-LD |
| [src/app/(marketing)/about/page.tsx](src/app/(marketing)/about/page.tsx) | Add `alternates.canonical` to existing metadata |
| [src/app/(marketing)/privacy/page.tsx](src/app/(marketing)/privacy/page.tsx) | Add `alternates.canonical` |
| [src/app/(marketing)/terms/page.tsx](src/app/(marketing)/terms/page.tsx) | Add `alternates.canonical` |

No changes to dashboard pages (correctly noindex via auth wall + robots.txt disallow).

---

## Verification

Run all these against the deployed site after each phase:

1. **robots.txt**: `curl https://resumatch.zeeshanai.cloud/robots.txt` returns the rules and sitemap URL
2. **sitemap.xml**: `curl https://resumatch.zeeshanai.cloud/sitemap.xml` returns valid XML with 4 URLs, lastmod dates
3. **Favicon**: browser tab shows the icon; `curl -I https://resumatch.zeeshanai.cloud/icon.png` returns 200
4. **OG preview**: paste landing-page URL into https://www.opengraph.xyz/ — image renders, title and description present
5. **Twitter card**: paste URL into https://cards-dev.twitter.com/validator (or X's new validator) — large image card preview
6. **Canonical**: `curl -s https://resumatch.zeeshanai.cloud/ | grep -i canonical` shows self-canonical `<link rel="canonical" href="https://resumatch.zeeshanai.cloud/">`
7. **Structured data**: https://search.google.com/test/rich-results against `/` reports valid Organization + SoftwareApplication, no errors
8. **PageSpeed**: https://pagespeed.web.dev/ on the landing URL — green Core Web Vitals, score > 90 mobile
9. **Mobile-friendly**: Chrome DevTools device toolbar — no horizontal scroll, tap targets ≥ 48px
10. **Indexation** (post-deploy, requires GSC verification): `site:resumatch.zeeshanai.cloud` in Google after 1–2 weeks shows all 4 marketing URLs indexed

---

## Out of Scope (Future Work)

- Blog / content marketing — currently no `/blog` route. Major opportunity for keyword-targeted content (e.g. "ATS resume tips", "how to tailor a resume"). Track separately.
- Programmatic SEO (e.g. `/resume-for-{job-title}` landing pages) — see `programmatic-seo` skill.
- AI-search optimization (AEO/GEO/LLMO) for ChatGPT, Perplexity, AI Overviews — see `ai-seo` skill once base SEO ships.
- Backlink building / digital PR — non-code work.
