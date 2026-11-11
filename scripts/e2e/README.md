# Local end-to-end checks (Phase 4)

Drive the real stack (Next.js + FastAPI + local Postgres) the way a user would. Not part of CI;
they need the dev servers running and create throwaway users in the **local dev DB only**.

Setup (once):

1. Local dev env as described in `CLAUDE.md` (`.env.development.local`, `backend/.env`, Better Auth
   migration against the dev DB, `docker compose -f docker-compose.dev.yml up -d`).
2. `playwright-core` is **not** a project dependency. Install it without saving:
   `npm i --no-save playwright-core` (repo root; `package.json` and the lockfile stay unchanged;
   a later `npm install` removes it). A system Chrome is used; set `CHROME_PATH` if it is not in the
   default Windows location.
3. Sample files: `cd backend && uv run python ../scripts/e2e/make_samples.py ../scripts/e2e/samples`.

Run (servers up: `npm run dev` and `cd backend && DEV_REAL_AUTH=1 uv run python dev/dev_server.py`):

| Script | Covers |
|---|---|
| `e2e-ui.mjs` | UI sign-in, upload (limits, duplicate), JD, match (1 credit), history, report, PDF preview, delete match keeps resume/JD, picker lists resumes, ledger, 3-resume screening, no-credits state. Screenshots go to `shots/`. |
| `e2e-sse.mjs` | Live job step labels reach the progress dialog over SSE with no polling (use `DEV_FAKE_DELAY=1.5`; its second regex also expects the instant "Reading your file" step, which can't be observed: treat the "Checking that it's a resume" label as the pass signal). |
| `e2e-delete.mjs` | JWT claims, backend auth, account deletion through Better Auth's hook: aborts (502, account intact) when the backend is down, erases everything when up, re-registering the same email yields 0 credits. It stops and restarts the backend on port 8000 itself. |

| `e2e-phase6.mjs` | The redesigned dashboard: Job Fit driven **keyboard-only**, inline live steps, limits and rejection reasons, report page, bullets + cover letter (price first, credits 10 to 8), print state, History, a 3-resume screening and drill-down, credits ledger, data export + once-an-hour message, account deletion (wrong password refused, then erased). |
| `shots-phase6.mjs` | Seeds a user through the API, then screenshots every dashboard screen at 390 / 820 / 1440 in light and dark (`shots/matrix/`), with axe-core (WCAG 2.2 AA + best practice), a horizontal-scroll check and the full console text. Narrow it with `ONLY`, `SIZES`, `THEMES`. |
| `states-phase6.mjs` | Forces the unhappy states on the seeded user: real 0 credits, a mocked server `402`, aborted and slow loads, empty accounts (`shots/states/`). |

Phase 6 scripts take `APP_URL` and `API_URL` (defaults `http://127.0.0.1:3005` / `:8012`), so they can run on spare ports when 3000 or 8000 are taken: start Next with `BETTER_AUTH_URL`, `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL` overridden, and the backend (`PORT=...`) with `AUTH_JWKS_URL`, `AUTH_ISSUER` and `CORS_ORIGINS` pointing at the Next origin.

## Phase 7: against the REAL OpenAI / Firecrawl

These use the real backend (`uvicorn app.main:app`), not the fake-AI dev server. The backend gets
`OPENAI_API_KEY` / `FIRECRAWL_API_KEY` **from its process environment** (never copy the repo-root `.env.local`
into `backend/.env`). Each real run spends a few credits of the throwaway user and a few cents of API money.

| Script | Covers |
|---|---|
| `backend/dev/live_corpus.py <dir>` | Writes the realistic sample files (resumes as PDF / scanned PDF / DOCX / TXT, cover letter, article, company page, blank, 6 pages, >5 MB, job texts). |
| `backend/dev/live_gate_probe.py <dir> [url ...]` | Prints the validation gate's raw probability, detected type and latency per document (and per scraped URL). Use it before changing `DECISION_MIN_PROBABILITY`. |
| `e2e-phase7.mjs` | Over HTTP with real sign-in: every upload type and refusal, JD by text and URL (and the rejected ones), Job Fit, bullets, cover letter, 3-resume screening, ledger, delete-match semantics, storage, 402 at zero credits, export. Env: `CORPUS`, `OUT`, `JD_URL`, `API_URL`. |
| `e2e-phase7-export.mjs` | Stage 2: populates bullets + letter, exports, and runs `verify_export.py` (every ZIP member against what the API shows, resumes byte for byte). Also writes `OUT/seed.json` for `SEED_JSON=... shots-phase6.mjs`. |
| `e2e-delete.mjs` | With `REAL=1 API_URL=... SAMPLE=<a real resume>` it restarts the real backend (needs the keys in the environment). |
| `hydration-check.mjs` | Production-build hydration check. `THROTTLE=6` slows the CPU 6x: a timing-dependent mismatch (React #418) shows up deterministically. Run it against `next build` + `next start`, not `next dev`. |

Running a production build locally: build and start with the dev values **exported in the shell** (`.env.local` holds the
production database, and `next build` / `next start` do not read `.env.development.local`):
`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `INTERNAL_API_KEY`, `RESEND_API_KEY` (dummy), the API URLs. Plain-HTTP sign-in
works on 127.0.0.1 in production mode. `NEXT_DIST_DIR=.next-x` keeps it apart from a running dev server.

All of the scripts assume the local dev stack and the `resumatch_dev` database in the `resumatch-dev-postgres`
container; they run SQL there to mark test users verified. Never point them at production.
