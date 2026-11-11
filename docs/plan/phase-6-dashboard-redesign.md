# Phase 6: Dashboard redesign and new product screens

Branch: `phase-6-dashboard`. Master plan sections: Part 4 "Dashboard", account-deletion UI and data export UI from Part 1.

## Read first
`README.md`, `master-plan.md`, `handoff.md` (Phase 4 notes on temporary progress UI; Phase 5 notes on tokens and proof marks), `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`. Load the `impeccable` skill (product register).

## Goal
Every dashboard screen in the new system, plus the new report page and account features, all on the Phase 4 data layer.

## Tasks
1. Shell: re-tokenize sidebar and top bar; working Help link.
2. Overview: recent analyses as a ledger with credits and next action (replaces three stat cards).
3. Job Fit and Screener flows: redesigned steps; resume picker lists existing resumes; accepts PDF, DOCX, TXT; limits stated next to the upload area with client-side size check and specific server rejection reasons; replace the fake-progress modal with an inline live step list fed by job events.
4. Report page `/dashboard/reports/[id]`: full page laid out as the document with margin annotations (reuse proof marks); rationale, tailored bullets and cover letter tabs (generate on demand, credit cost shown before the cover-letter action); print stylesheet replaces the `document.write` hack. Merge `match-results.tsx` and `match-detail-dialog.tsx` into one report component.
5. Screener results: ranked table with drill-down to each candidate's report.
6. Settings "Account" tab: "Download my data" (ZIP export, handles the once-per-hour limit message) and "Delete account" (typed email + password; Google-only users use the emailed link flow; plain statement of what is erased, that it is irreversible, and the deleted-email-hash note). After success sign out and go to landing.
7. History and Settings (profile, credits ledger) restyled; remove unused `jd-input.tsx`, `credit-badge.tsx`, `ui/progress.tsx`, `ui/tooltip.tsx` (confirm unused first).
8. Empty, loading, error and 402 (no credits) states for every screen.

## Exit criteria
- `npx tsc --noEmit` and `npm run build` pass.
- Screenshots of every dashboard screen and the report at mobile, tablet, desktop in light and dark; keyboard-only run through a full match; contrast AA; reduced motion.
- Print preview of a report looks right.
- Critique pass against DESIGN.md; fixes applied or logged.

## Handoff notes to record
Screens verified, any backend gaps discovered, anything cut or deferred.
