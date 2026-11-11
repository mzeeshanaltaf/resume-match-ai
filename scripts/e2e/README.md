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

All three assume the local dev stack and the `resumatch_dev` database in the `resumatch-dev-postgres`
container; they run SQL there to mark test users verified. Never point them at production.
