# CLAUDE.md — ResuMatchAI

AI-powered resume ↔ job-description matcher. Live: https://resumatch.zeeshanai.cloud

## Stack
- **Next.js 16.1.6** (App Router, `src/` dir), TypeScript, React 19
- **Tailwind CSS v4 + shadcn/ui** re-themed to the "editor's desk" design system (see **Design system** below), `next-themes` dark mode
- **Auth: Better Auth** (`better-auth` + `pg`) — email/password + Google OAuth
- **Postgres** — `resume_match` schema holds the Better Auth tables (`user`/`session`/`account`/`verification`/`jwks`, owned by the frontend) and the app tables (owned by the FastAPI backend's Alembic; the frontend never queries them)
- **FastAPI backend** (`backend/`) = the AI/data backend; the browser calls it directly with a Better Auth JWT. **n8n is only used by the contact form** (`src/app/api/contact`)
- **Resend** (auth OTP emails), **Umami** analytics, **Upstash Redis** (contact rate limit)
- Hosted on **Coolify** (Hostinger VPS), auto-deploy via **GitHub Actions** on push to `main`
- Package manager: **npm**. Repo: `mzeeshanaltaf/resume-match-ai`.

## Auth (Better Auth — replaced Clerk 2026-07-23)
- `src/lib/auth.ts` — `betterAuth({ database: new Pool({ connectionString, options: "-c search_path=resume_match" }), emailAndPassword, socialProviders (google, gated on env), plugins: [jwt(), emailOTP()], user.deleteUser })`
- `jwt()`: EdDSA, `issuer` = `audience` = `BETTER_AUTH_URL`, `definePayload` → `{ email }` only (+ `sub`). **Keep `email` in the payload**: the backend's deleted-account (0-credit) check reads it. Endpoints: `GET /api/auth/token` (needs the session cookie), `GET /api/auth/jwks`. Needs the `jwks` table (`npx @better-auth/cli@latest migrate`).
- `user.deleteUser.enabled` + `beforeDelete` → `DELETE {API_INTERNAL_URL}/internal/users/{id}` (`X-Internal-Key`, body `{email}`); **any failure throws**, so nothing is deleted unless the backend erased first. With no `sendDeleteAccountVerification` configured, `POST /api/auth/delete-user` takes `{password}` (or a fresh session for Google-only users).
- `src/lib/auth-client.ts` — `signIn/signUp/signOut/useSession/emailOtp`, `jwtClient()` (cast `as never`: better-auth 1.6.24's `jwtClient` types are rejected by `createAuthClient`, which also erases other plugins' typings), and **`getApiToken()` / `clearApiToken()`**: cached JWT, refreshed 60 s before `exp`, shared in-flight request. `signOut` is wrapped to clear the cache.
- `src/lib/get-user.ts` — `getUserId()`: server-side session check (no protected Next.js API routes remain besides auth/contact)
- **Signup credits are not granted here any more**: the backend creates the credit account (10 credits) on the user's first authenticated call.
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)`; health check at `/api/auth/ok`
- `src/proxy.ts` — Better Auth `getSessionCookie` gate for `/dashboard/*` → `/sign-in` (Next.js 16 uses `proxy.ts`, not `middleware.ts`)
- Custom `/sign-in` + `/sign-up` pages via `src/components/marketing/auth-form.tsx` (Google button only renders when `GOOGLE_CLIENT_ID`/`SECRET` set); all auth screens share `auth-shell.tsx`

## Email OTP (verification + password reset, added 2026-07-25)
- `emailOTP` plugin in `auth.ts`: `overrideDefaultEmailVerification`, `disableSignUp: true` (closes passwordless `/sign-in/email-otp`), 6 digits, `expiresIn: 600`, `allowedAttempts: 3`, `storeOTP: "hashed"`, `rateLimit {60s, 3}`. **Verification is ENFORCED** (`requireEmailVerification: true`) + `sendOnSignIn` + `autoSignInAfterVerification`.
- Sender: `src/lib/email.ts` (Resend, HTML+text template). `src/lib/otp-sender.ts` holds the client-safe `OTP_SENDER_EMAIL` used in the "check spam" copy — keep it in sync with `RESEND_FROM_EMAIL`.
- Screens: `/verify-email` (needs `<Suspense>`, reads `?email=&redirect=`) and `/forgot-password` (one route, request→reset steps). Shared bits in `src/components/marketing/otp-field.tsx` (`OtpField`, `EmailDeliveryNote`, `useCooldown`).
- Sign-up returns **no session** → redirect to `/verify-email`. Sign-in error `EMAIL_NOT_VERIFIED` → same redirect (this is how pre-existing unverified users get through; no backfill was run). `resetPassword` creates **no session** → back to `/sign-in`. Google users arrive pre-verified.
- **No DB migration** — codes live in the existing `verification` table.
- `RESEND_FROM_EMAIL` must be **unquoted** in Coolify (dotenv strips quotes, Docker doesn't → Resend 422 on `from`). `<Toaster>` now lives in the **root** layout (was dashboard-only, which silently swallowed every marketing-page toast).
- Preflight: `node ~/.claude/skills/better-auth-email-otp/scripts/preflight.mjs --app-dir src/app`.

## Design system (Phase 5; read `PRODUCT.md` and `DESIGN.md` before any UI work)
- Direction: "the editor's desk". Paper neutrals, deep ink, **red pencil = a fix, proofreader blue = a confirmation**, nothing else is an accent. No emerald, glows, gradients, glass, italics in display type, mono eyebrows, or pure black/white; no em dashes in copy.
- **Tokens only** in `src/app/globals.css` (OKLCH). Standard shadcn names (`bg-background`, `text-muted-foreground`, `border-input`, `ring`, `sidebar-*`, `chart-*`) plus `pencil`/`pencil-wash`/`proof`/`proof-wash`, `score-high|mid|low`, and the paper document set `page`, `page-foreground`, `page-muted`, `page-rule`, `page-pencil`, `page-proof` (stay light in dark mode). `shadow-sheet` is for a document only; `shadow-overlay` for menus and dialogs. Never write a color literal in a component (the generated icons/OG image/manifest are the exception and mirror the tokens in hex).
- Fonts: `src/lib/fonts.ts` (`--font-schibsted` to `font-sans`, `--font-literata` to `font-serif`, `--font-handwriting` to `font-hand`). The root layout applies the first two; `(marketing)/layout.tsx` applies the hand. A page using `font-hand` outside `(marketing)` must wrap itself in `reenieBeanie.variable`.
- Proof marks: `src/components/proof/` (`Strike`, `Circled`, `Underlined`, `Insert`, `MarginNote`, `ScoreMark`, `ProofStroke`, `useDraw`). Draw via a shared `progress` motion value + `range`, or self-timed (`delay`/`duration`); finished and static under `prefers-reduced-motion`. `surface="page"` when drawn on a `bg-page` sheet.
- Landing sections live in `src/components/marketing/landing/`; shared `Wordmark`/`LogoMark` in `src/components/brand/`. Long-form legal pages use `LegalPage`.
- Verification helpers (scripts in the repo, packages not): Playwright + a system Chrome, `axe-core`. `npm i --no-save playwright-core axe-core`; scripts in `scripts/e2e/` (see its README; Phase 6: `e2e-phase6.mjs`, `shots-phase6.mjs`, `states-phase6.mjs`).

## Layout & routing
- Route groups: `(marketing)` public, `(dashboard)` protected
- `src/app/layout.tsx` — theme provider + gated Umami `<Script>` + Organization JSON-LD (no auth provider needed)
- Marketing: landing (`page.tsx`), `sign-in`, `sign-up`, `contact`, about/privacy/terms
- Dashboard (Phase 6, all on the token system): `page.tsx` overview, `match` (Job Fit), `screen` (Recruiter screening), `history`, `reports/[id]` (the report as a full page), `settings` (profile, credits, account), `help`
- `src/contexts/dashboard-data.tsx` — `DashboardDataProvider` fetches `/v1/overview`, `/v1/credits` (balance + prices), `/v1/credits/transactions?limit=200`, `/v1/matches`, `/v1/resumes`, `/v1/job-descriptions?limit=500` in parallel; `refreshAll()` after a match/screening/delete, `refreshCredits()` for balance + ledger only; `addResume()` / `removeMatch()` for instant UI updates. Consumed by all dashboard pages. Never hardcode credit prices: use `credits.costs`.

## Talking to the backend (`src/lib/api/`)
- `client.ts` — `api.*` typed endpoints, `ApiError {status, code, message, details}` (parsed from the backend's `{code,message,details}`), `waitForJob<T>(jobId, {onSteps})`: fetch-based SSE reader (EventSource can't send the `Authorization` header) that replays the full history first and **falls back to polling `GET /v1/jobs/{id}`** if the stream drops. One automatic token refresh + retry on `AUTH_REQUIRED|INVALID_TOKEN|TOKEN_EXPIRED`.
- `types.ts` — hand-written from `backend/openapi.json` (keep in step; the match report types are the old n8n shapes). `errors.ts` — `describeError(err)` maps codes to messages (402 → "You need N credits…"). `limits.ts` — upload limits shown in the UI (mirror the backend defaults; the API doesn't expose them).
- Long work = `202 {job_id}` → `waitForJob`. Result shapes: resume `{resume_id, resume}`, JD `{jd_id, job_description}`, match `{match_id, match}`, screening `ScreeningResult`.
- **Modes**: Job Fit uses `candidate` resumes/JDs, the Screener `recruiter` ones (backend `422 MODE_MISMATCH` otherwise). Pickers list existing resumes filtered by mode. Dedup is per mode; a `409 DUPLICATE_RESUME` / `DUPLICATE_JD` is handled by reusing the existing item.
- Match = 1 credit, screening = 1 per resume (all-or-nothing up front, failed items refunded), upload/JD processing free. Deleting a match keeps the resume and JD. Resume files come from `GET /v1/resumes/{id}/file` on demand (blob → `PdfViewer file={blob}`; DOCX/TXT are download-only).
- Progress UI: `StepList` (`components/dashboard/step-list.tsx`) is the inline live list fed by `waitForJob({onSteps})`; there is no blocking progress modal any more.
- Dashboard patterns: `PageHeader`, `ErrorNote` / `NoCredits` / `RequestError` (a `402 INSUFFICIENT_CREDITS` shows the numbers), `CostLedger` (price and balance-after before any spend), `ScrollRegion` (wide tables: focusable, and `relative` so `sr-only` cells cannot widen the page), `flow/` (shared upload, pickers, `useJobPosting`). Scores go through `lib/score.ts`.
- Report (`components/dashboard/report/`): `Paper` sheet + `Entry` (text left, `MarginNote` right from `xl`, under the text below) + `Marked` (drawn mark for a short phrase, CSS decoration for a long one). Buttons on the sheet use `paperButton` (the sheet stays light in dark mode). Print is CSS: shell `print:hidden`, all tabs print, marks forced finished in `globals.css`. Own tabs component (`report-tabs.tsx`) because Radix hides inactive panels with `[hidden]`, which would not print.
- Account: Settings > Account. Export = `api.account.export()` (blob; `429 EXPORT_RATE_LIMITED` shown inline). Delete = `authClient.deleteUser({password})`; Google-only users (no `credential` account, via `listAccounts`) send no password and rely on a fresh session (`SESSION_EXPIRED` is explained in the UI). `sendDeleteAccountVerification` stays **unconfigured**: with it set, Better Auth emails a link even when a password is sent.
- Hydration: **never gate render output on `useSession()` directly**; use `useClientSession()` (`src/lib/use-client-session.ts`), which stays "pending" for the first client render. A plain `useSession()` can already hold data on a late-hydrating component (the Settings tabs), which is a production-only React #418 (found in Phase 7 with `scripts/e2e/hydration-check.mjs`, `THROTTLE=6`).
- Hydration: `TopNav` renders the mobile `Sheet` only after mount (Radix ids differed server vs client on pages with Suspense boundaries).

## n8n (contact form only)
- `src/app/api/contact/route.ts` posts to a hardcoded n8n webhook with `N8N_API_KEY` (honeypot field `hp_field` + Upstash limiter in `src/lib/rate-limit.ts`, fails open). Nothing else in `src/` may reference n8n.

## Next.js API routes
`contact` · `auth/[...all]` · `auth/ok`. Everything else is a call from the browser to the FastAPI backend.

## Commands
- **Run both apps locally** (3 terminals): `cd backend && docker compose -f docker-compose.dev.yml up -d && uv run alembic upgrade head`, then backend `cd backend && uv run uvicorn app.main:app --reload` (or `DEV_REAL_AUTH=1 uv run python dev/dev_server.py` for fake AI + real sign-in), then frontend `npm run dev`. Open **http://127.0.0.1:3000** (not `localhost` — IPv6/WSL2 quirk).
- `npm run dev` — dev server (`--hostname 0.0.0.0`)
- `npx tsc --noEmit` — typecheck · `npm run build` — prod build (needs real `BETTER_AUTH_SECRET`; Google optional)
- Better Auth schema: `CREATE SCHEMA IF NOT EXISTS resume_match;` then `DATABASE_URL=… BETTER_AUTH_SECRET=… npx @better-auth/cli@latest migrate` (creates `jwks` too). **Pass `DATABASE_URL` explicitly**: `.env.local` holds the production URL.
- Local dev env: put the dev values in a gitignored **`.env.development.local`** (Next loads it after `.env.local` for `next dev`): `DATABASE_URL=postgresql://resumatch:resumatch@127.0.0.1:5433/resumatch_dev`, `BETTER_AUTH_URL=http://127.0.0.1:3000`, `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, `INTERNAL_API_KEY`, and a dummy `RESEND_API_KEY` so no real email is sent. Backend `backend/.env`: `AUTH_JWKS_URL=http://127.0.0.1:3000/api/auth/jwks`, `AUTH_ISSUER=http://127.0.0.1:3000`, `CORS_ORIGINS=http://127.0.0.1:3000`, same `INTERNAL_API_KEY`.
- Dev users can't receive the OTP email: sign up, then `update resume_match."user" set "emailVerified" = true where email = …` in the dev DB.

## Env vars (`.env.local`; template in `.env.example`, kept via `!.env.example` gitignore exception)
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (also JWT issuer/audience; must equal the backend's `AUTH_ISSUER`), `DATABASE_URL`, `GOOGLE_CLIENT_ID/SECRET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` (unquoted, runtime),
`NEXT_PUBLIC_API_URL` (**build-time**), `API_INTERNAL_URL` + `INTERNAL_API_KEY` (runtime, server-only; account deletion),
`N8N_API_KEY` (contact form only),
`NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Deployment (Coolify)
- App UUID `m12enit7riai77x6d76m7m90`; deploy = `git push origin main` → `.github/workflows/deploy.yml` calls the Coolify deploy API (retries). Secrets: `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN`.
- In Coolify, mark every `NEXT_PUBLIC_*` and `BETTER_AUTH_URL` **build-time**; secrets runtime.
- Container `DATABASE_URL` uses the **docker0 gateway IP `10.0.0.1`**, not the public IP. The frontend builds with **Railpack** (Coolify `build_pack=railpack`): `RAILPACK_INSTALL_CMD=npm install` (cross-OS lockfile drift), `RAILPACK_NODE_VERSION=22`.
- SSH admin: `ssh -i ~/.ssh/hostinger_vps_ed25519 root@76.13.7.106`; Coolify API on `http://localhost:8000/api/v1`.

## backend/ (FastAPI, added in the rebuild — see `docs/plan/`)
- Python 3.12 + uv. Run: `cd backend && docker compose -f docker-compose.dev.yml up -d && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload` (port 8000); tests: `uv run pytest`.
- Reads `backend/.env` only, **never** the repo-root `.env.local` (production `DATABASE_URL`). All settings/limits/model names live in `backend/app/config.py`; template `backend/.env.example`.
- Phase 2 added the documents pipeline: `POST/GET /v1/resumes`, `/v1/job-descriptions`, `/v1/jobs/{id}[/events]` (SSE). Uploads return `202 {job_id}`; extraction, OCR, the Decisions-API validation gate and storage run as in-process jobs. All OpenAI calls go through `app/services/llm.py`; model/tier/limits come only from settings. `uv run python dev/dev_server.py` runs the app with a dev JWT and fake AI (no keys).
- Phase 3 completed the API: `POST/GET/DELETE /v1/matches`, `/v1/matches/{id}/{tailored-bullets,cover-letter}`, `POST /v1/screenings`, `/v1/overview`, `/v1/credits[/transactions]`, `GET /v1/account/export`, `DELETE /internal/users/{id}` (X-Internal-Key + body `{email}`; Better Auth's `beforeDelete` hook must send it). Credit-spending jobs reserve with the job row and refund via `services/reservations.py`. The contract is `backend/openapi.json` (`uv run python dev/export_openapi.py`; a test fails when stale); `uv run python dev/smoke_phase3.py` drives it all over real HTTP.
- Phase 4 wired the Next.js app to it (see "Talking to the backend"); production still runs the old n8n build until the deploy phase. `DEV_REAL_AUTH=1 uv run python dev/dev_server.py` = real Better Auth JWTs (JWKS from `backend/.env`) + fake AI. Migration `0002` truncates tables: do not run against production before the deploy phase.

- Phase 7 (live verification against real OpenAI/Firecrawl): `DECISION_MIN_PROBABILITY` stays `0.7` (observed: right documents 0.81-1.00, wrong ones 0.00-0.05). `ENVIRONMENT=prod` now **refuses to start** unless `EMAIL_HASH_SALT` (not the default, 16+ chars), `INTERNAL_API_KEY` (16+ chars), `STORAGE_BACKEND=s3` and `OPENAI_API_KEY` are set. JD URLs must point to a public host (no localhost, private/link-local IPs, single-label or `.internal`/`.local` names). The LLM wrapper logs `tier` and seconds for every call (flex 429s fall back to `default`). Live scripts: `backend/dev/live_corpus.py` (writes realistic sample files), `backend/dev/live_gate_probe.py` (gate probabilities), `scripts/e2e/e2e-phase7.mjs`, `e2e-phase7-export.mjs`, `verify_export.py`. The real backend needs `OPENAI_API_KEY` / `FIRECRAWL_API_KEY` **in the process environment** (never copy `.env.local` into `backend/.env`).
- A second `next dev` next to another one: set `NEXT_DIST_DIR=.next-x` (own build dir; the default `.next` dir lock blocks a second instance).

## Conventions & gotchas
- Client components using auth/session must be `"use client"` and use `useClientSession()` (not `useSession()`, see Hydration above).
- Wrap browser-only-state client trees in `next/dynamic` `{ ssr: false }` to avoid hydration-mismatch dead UI.
- `react-pdf`/`pdfjs-dist` needs the canvas alias in `next.config.ts` (both turbopack + webpack) — see the global `~/.claude/CLAUDE.md`.
- Don't reintroduce Clerk, Vercel Analytics, or `middleware.ts`. Keep the contact form's honeypot + progressive-enhancement (native POST fallback) intact.
