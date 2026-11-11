# Phase 5: Design system and marketing/auth redesign

Branch: `phase-5-design-system`. Master plan sections: Part 4 (direction, landing page, "also restyled" list).

## Read first
`README.md`, `master-plan.md`, `handoff.md`, `CLAUDE.md`. Load the `impeccable` skill (and `design-taste-frontend` / `frontend-design` if useful) before any UI work. No native image generation is available; skip image probes.

## Goal
A written design system and the public-facing half of the product rebuilt in the "editor's desk" direction.

## Tasks
1. Write `PRODUCT.md` (register, users: job seekers and recruiters equally, personality, anti-references, principles) and `DESIGN.md` (OKLCH tokens, type, components, motion rules, proof-mark spec) at repo root **before any UI code**.
2. `src/app/globals.css`: token rewrite (warm paper neutrals, deep ink, red pencil accent, proofreader blue; no emerald, glows, gradients, pure black/white; dark mode as "desk at night" via the same tokens). Re-theme shadcn primitives in `src/components/ui` through tokens, not per-component hex.
3. Fonts in root and `(marketing)` layouts: Schibsted Grotesk, Literata, one handwriting face for margin notes only; remove Geist, DM Serif Display and mono eyebrows.
4. Proof-mark component(s): SVG strike-through, circle, caret, margin note drawn with path-length animation via `motion`; static under `prefers-reduced-motion`.
5. Rebuild the landing page per the plan: hero with a resume page marked up on scroll ending in the score; two desks (candidate, recruiter); anatomy of a report; honest credits section (10 free, 1 per analysis, uploads and JD free, no tiers); FAQ with truthful retention wording; footer. Navbar gets a real mobile menu. Remove invented metrics.
6. Restyle about (remove false claims), contact (keep honeypot and native POST fallback intact), privacy, terms (mention deleted-email hash for signup-credit abuse prevention), auth shell (sign-in, sign-up, verify-email, forgot-password), 404, app icons, OG image.
7. Keep Umami script, Organization JSON-LD, metadata/SEO intact.

## Exit criteria
- `npx tsc --noEmit` and `npm run build` pass.
- Browser screenshots (landing, auth screens, contact, about) at mobile, tablet, desktop, light and dark; no horizontal scroll at mobile; keyboard focus visible; contrast AA; reduced-motion verified.
- One critique pass against DESIGN.md and the impeccable bans; findings fixed or logged in handoff.

## Handoff notes to record
Token names and where defined, the proof-mark component API (Phase 6 reuses it for the report), font variable names, any shadcn primitives not yet re-themed.
