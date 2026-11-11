# Phase 7: Local end-to-end verification and tuning

Branch: `phase-7-verification` (fixes only). Master plan section: "Verification".

## Read first
`README.md`, `master-plan.md`, `handoff.md`, `CLAUDE.md`.

## Goal
Prove the whole system works locally against real OpenAI and Firecrawl before touching production. Fix what breaks.

## Tasks
1. **Validation gate, live** with real keys: a real resume, a scanned resume, a cover letter, a random article, a blank page as "resume"; a real posting, a company about page, a news article as "JD". Record observed probabilities and set `DECISION_MIN_PROBABILITY` accordingly. Confirm the specific rejection messages. Check `flex` tier latency and the fallback behavior.
2. **Full local run** (`uvicorn` + `npm run dev` at `http://127.0.0.1:3000`): text PDF, scanned PDF, DOCX, 6-page PDF (refused), >5 MB file (refused); JD by URL and by text; Job Fit match; 3-resume screening; tailored bullets; cover letter; delete a match and confirm resume and JD survive; confirm credit ledger entries and 402 at zero credits.
3. **Export**: download the ZIP for a populated account; every file opens and matches the app.
4. **Account deletion** with a throwaway account: zero rows for that user id in every `resume_match` table, no objects under its prefix, sign-in fails afterwards, re-registering the same email yields 0 credits; also force the internal call to fail and confirm deletion aborts with the account intact.
5. **Storage** (local backend here; MinIO checks happen in Phase 8): DB row has no binary, preview works, delete removes the file.
6. Run `/security-review` style pass on the backend (ownership scoping on every query, internal key, upload handling, SSRF on the JD URL fetch through Firecrawl) and fix findings.
7. Full pytest, `npx tsc --noEmit`, `npm run build`.

## Exit criteria
Every item above passes or is explicitly logged as accepted risk in handoff. Final threshold value and model settings recorded.

## Handoff notes to record
Chosen `DECISION_MIN_PROBABILITY`, observed latencies, bugs fixed, accepted risks, exact final env var list for production.
