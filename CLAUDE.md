# CLAUDE.md — ResuMatchAI

AI-powered resume ↔ job-description matcher. Live: https://resumatch.zeeshanai.cloud

## Stack
- **Next.js 16.1.6** (App Router, `src/` dir), TypeScript, React 19
- **Tailwind CSS v4 + shadcn/ui** (slate theme, emerald `#10b981` accent), `next-themes` dark mode
- **Auth: Better Auth** (`better-auth` + `pg`) — email/password + Google OAuth
- **Postgres** — holds only Better Auth tables (`user`/`session`/`account`/`verification`) in the **`resume_match`** schema
- **n8n webhooks** = the sole AI/data backend (no ORM, no app tables in code)
- **Umami** analytics, **Upstash Redis** (contact rate limit)
- Hosted on **Coolify** (Hostinger VPS), auto-deploy via **GitHub Actions** on push to `main`
- Package manager: **npm**. Repo: `mzeeshanaltaf/resume-match-ai`.

## Auth (Better Auth — replaced Clerk 2026-07-23)
- `src/lib/auth.ts` — `betterAuth({ database: new Pool({ connectionString, options: "-c search_path=resume_match" }), emailAndPassword, socialProviders (google, gated on env), databaseHooks.user.create.after → signupCredits() })`
- `src/lib/auth-client.ts` — `signIn/signUp/signOut/useSession`
- `src/lib/get-user.ts` — **`getUserId()`**: the single server-side auth check used by every protected API route (replaced Clerk's `auth()`)
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)`; health check at `/api/auth/ok`
- `src/proxy.ts` — Better Auth `getSessionCookie` gate for `/dashboard/*` → `/sign-in` (Next.js 16 uses `proxy.ts`, not `middleware.ts`)
- Custom `/sign-in` + `/sign-up` pages via `src/components/marketing/auth-form.tsx` (Google button only renders when `GOOGLE_CLIENT_ID`/`SECRET` set)
- **New-user credits come from the DB hook**, not a webhook. Email verification / password reset are OFF.

## Layout & routing
- Route groups: `(marketing)` public, `(dashboard)` protected
- `src/app/layout.tsx` — theme provider + gated Umami `<Script>` + Organization JSON-LD (no auth provider needed)
- Marketing: landing (`page.tsx`), `sign-in`, `sign-up`, `contact`, about/privacy/terms
- Dashboard: overview, `match` (Job Fit), `screen` (Recruiter screening), `history`, `settings`
- `src/contexts/dashboard-data.tsx` — `DashboardDataProvider` caches analytics/matches/credits; `refreshAll()` after workflows, `refreshCredits()` after uploads. Consumed by all dashboard pages.

## n8n integration (`src/lib/n8n*.ts`)
- `n8n.ts` = client (`callN8nWebhook`, `callN8nWebhookMultipart`); adds `x-api-key`
- `n8n-main.ts` (process_resume/scrape_jd/resume_match), `n8n-analytics.ts`, `n8n-credits.ts`, `n8n-data.ts` (`getUserData` unified), `n8n-delete.ts`
- All webhook IDs + `N8N_API_KEY` in env. n8n keys off the Better Auth user id.
- Contact form posts to a hardcoded n8n webhook via `src/app/api/contact/route.ts` (honeypot field `hp_field` + Upstash limiter in `src/lib/rate-limit.ts`, fails open).

## API routes (all guard with `const userId = await getUserId()` → 401 if null)
`resume/{upload,list,[id]}` · `jd/{submit,list,[id]}` · `match/{run,history,[id]}` · `analytics` · `credits/{balance,history}` · `user-data` (unified) · `contact` · `auth/[...all]` · `auth/ok`

## Commands
- `npm run dev` — dev server (`--hostname 0.0.0.0`); open **http://127.0.0.1:3000** (not `localhost` — IPv6/WSL2 quirk)
- `npx tsc --noEmit` — typecheck · `npm run build` — prod build (needs real `BETTER_AUTH_SECRET`; Google optional)
- Better Auth schema: `CREATE SCHEMA IF NOT EXISTS resume_match;` then `npx @better-auth/cli@latest migrate`

## Env vars (`.env.local`; template in `.env.example`, kept via `!.env.example` gitignore exception)
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID/SECRET`,
`N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_*_WEBHOOK_ID`,
`NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Deployment (Coolify)
- App UUID `m12enit7riai77x6d76m7m90`; deploy = `git push origin main` → `.github/workflows/deploy.yml` calls the Coolify deploy API (retries). Secrets: `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN`.
- In Coolify, mark every `NEXT_PUBLIC_*` and `BETTER_AUTH_URL` **build-time**; secrets runtime.
- Container `DATABASE_URL` uses the **docker0 gateway IP `10.0.0.1`**, not the public IP. Build uses `NIXPACKS_INSTALL_CMD=npm install` (cross-OS lockfile drift), Node 22.
- SSH admin: `ssh -i ~/.ssh/hostinger_vps_ed25519 root@76.13.7.106`; Coolify API on `http://localhost:8000/api/v1`.

## Conventions & gotchas
- Client components using auth/session must be `"use client"` and use `useSession()`.
- Wrap browser-only-state client trees in `next/dynamic` `{ ssr: false }` to avoid hydration-mismatch dead UI.
- `react-pdf`/`pdfjs-dist` needs the canvas alias in `next.config.ts` (both turbopack + webpack) — see the global `~/.claude/CLAUDE.md`.
- Don't reintroduce Clerk, Vercel Analytics, or `middleware.ts`. Keep the contact form's honeypot + progressive-enhancement (native POST fallback) intact.
