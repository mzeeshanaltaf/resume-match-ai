# ResuMatchAI

An AI-powered SaaS application that matches resumes against job descriptions, providing intelligent scoring, gap analysis, and personalized recommendations. A Next.js frontend talks directly to a FastAPI backend (`backend/`) with a short-lived Better Auth JWT.

**Live Demo:** [resumatch.zeeshanai.cloud](https://resumatch.zeeshanai.cloud)

## Features

### 🎯 Job Fit Analysis
- Upload your resume and paste a job description
- Get an instant AI match score (0-100%)
- See detailed analysis of strengths and gaps
- Get personalized improvement recommendations
- Receive ATS optimization suggestions

### 🔍 Resume Screening (Recruiter)
- Upload multiple candidate resumes
- Screen against a job posting
- Ranked results sorted by match score
- Bulk candidate evaluation in minutes
- Detailed screening reports for each resume

### 📊 Smart Dashboard
- Track all past analyses in one place
- View analytics and usage statistics
- Manage your credit balance
- See recent screening results
- Search and filter analysis history

### ⚡ Credit System
- 10 credits on signup; uploads and job-description processing are free
- 1 credit per match analysis (and per resume in a screening); refunded if the analysis fails
- Real-time credit tracking
- Transaction history (the ledger)

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS v4
- **UI Components:** shadcn/ui (Slate theme)
- **Auth:** [Better Auth](https://better-auth.com) — email/password + Google OAuth, with enforced email-OTP verification and password reset, backed by Postgres
- **Database:** Postgres — Better Auth tables (`user`, `session`, `account`, `verification`) in a `resume_match` schema
- **Backend:** FastAPI service in [`backend/`](backend/README.md) (Python 3.12, SQLAlchemy, OpenAI, Firecrawl, MinIO); the browser calls it directly with a Better Auth JWT (EdDSA, verified via `/api/auth/jwks`)
- **Contact form:** still an n8n webhook (the only remaining n8n use)
- **Transactional email:** [Resend](https://resend.com) (verification & password-reset codes)
- **Analytics:** self-hosted [Umami](https://umami.is)
- **Rate limiting:** Upstash Redis (contact form)
- **Styling:** Tailwind CSS v4 with dark mode support
- **State Management:** React Context API
- **Hosting:** Coolify on a Hostinger VPS (auto-deploy via GitHub Actions)
- **SEO:** robots.txt, XML sitemap, OG/Twitter image generation, JSON-LD structured data, PWA manifest

## Project Structure

```
src/
├── app/
│   ├── (marketing)/          # Public marketing pages
│   │   ├── page.tsx          # Landing page (metadata + SoftwareApplication JSON-LD)
│   │   ├── sign-in/page.tsx  # Better Auth sign-in (email/password + Google)
│   │   ├── sign-up/page.tsx  # Better Auth sign-up
│   │   ├── verify-email/     # 6-digit email verification (Suspense-wrapped)
│   │   ├── forgot-password/  # Password reset (request code → set new password)
│   │   ├── contact/page.tsx  # Contact form (honeypot + Upstash rate limit)
│   │   ├── about/page.tsx
│   │   ├── privacy/page.tsx
│   │   ├── terms/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/          # Protected dashboard pages
│   │   ├── dashboard/
│   │   │   ├── page.tsx      # Overview
│   │   │   ├── match/        # Job Fit Analysis
│   │   │   ├── screen/       # Resume Screening
│   │   │   ├── history/      # Past analyses
│   │   │   └── settings/     # User settings & credits
│   │   └── layout.tsx        # Dashboard shell with DashboardDataProvider
│   ├── api/
│   │   ├── auth/[...all]/    # Better Auth handler (+ /api/auth/ok, /api/auth/jwks, /api/auth/token)
│   │   └── contact/          # Contact form → n8n (honeypot + rate limit)
│   ├── icon.tsx              # Generated 32×32 favicon (ImageResponse)
│   ├── apple-icon.tsx        # Generated 180×180 Apple icon
│   ├── opengraph-image.tsx   # Generated 1200×630 OG image
│   ├── twitter-image.tsx     # Twitter card (reuses OG image)
│   ├── robots.ts             # Crawl rules (allow marketing, disallow dashboard/api)
│   ├── sitemap.ts            # XML sitemap for 4 public URLs
│   ├── manifest.ts           # PWA web manifest
│   └── layout.tsx            # Root layout: theme provider, Toaster, Umami script & Organization JSON-LD
├── components/
│   ├── dashboard/
│   │   ├── match/            # Match workflow components
│   │   ├── screen/           # Screening workflow components
│   │   ├── history/          # History & details components
│   │   ├── settings/         # Settings components
│   │   ├── sidebar.tsx
│   │   ├── top-nav.tsx
│   │   └── credit-display.tsx
│   ├── marketing/            # Landing page + auth screens
│   │   ├── auth-shell.tsx    # Shared frame for all four auth screens
│   │   ├── auth-form.tsx     # Sign-in / sign-up form
│   │   ├── verify-email-form.tsx
│   │   ├── forgot-password-form.tsx
│   │   └── otp-field.tsx     # OtpField, EmailDeliveryNote, useCooldown
│   ├── ui/                   # shadcn/ui primitives
│   └── theme-provider.tsx    # next-themes wrapper
├── contexts/
│   └── dashboard-data.tsx    # DashboardDataProvider (overview, matches, resumes, JDs, credits, ledger)
├── lib/
│   ├── auth.ts               # Better Auth server config (pg Pool, providers, emailOTP, jwt(), deleteUser → backend erase)
│   ├── auth-client.ts        # Better Auth React client + cached API JWT (getApiToken / clearApiToken)
│   ├── api/
│   │   ├── client.ts         # Typed FastAPI client: JWT, {code,message,details} errors, SSE job events
│   │   ├── types.ts          # Types for backend/openapi.json (incl. the match report)
│   │   ├── errors.ts         # describeError(): user-facing message per error code
│   │   └── limits.ts         # Upload limits shown in the UI (mirror the backend defaults)
│   ├── email.ts              # Resend sender + OTP email template (server-only)
│   ├── otp-sender.ts         # OTP_SENDER_EMAIL — client-safe sender address constant
│   ├── get-user.ts           # getUserId() — server-side session helper
│   └── rate-limit.ts         # Upstash sliding-window limiter (fails open)
└── proxy.ts                  # Better Auth session-cookie gate for /dashboard/* (Next.js 16 middleware)
```

## Architecture

### Data Flow

```
Browser ──(Better Auth session cookie)──► Next.js /api/auth  ── issues a 15-min EdDSA JWT (/api/auth/token)
   │
   └──(Authorization: Bearer <JWT>)──► FastAPI /v1/*  ── verifies against Next.js /api/auth/jwks
                                          │
        uploads / JD / match / screening  │  202 {job_id}
        ◄── SSE /v1/jobs/{id}/events ─────┘  (live steps, then the result)
```

- The client (`src/lib/api/client.ts`) caches the JWT and refreshes it a minute before it expires.
- Long work is a backend **job**: the UI shows the real steps from the event stream and falls
  back to polling if the stream drops.
- Account deletion: Better Auth's `user.deleteUser.beforeDelete` calls the backend's internal
  erase endpoint first and aborts if it fails, so identity and data are never half-deleted.

### Authentication Flow

Email verification is **enforced** — an account gets no session until its 6-digit code is entered.

```
Sign up → account created, NO session → /verify-email → code entered → session issued → /dashboard
Sign in (unverified) → EMAIL_NOT_VERIFIED + fresh code auto-sent → /verify-email → …
Forgot password → /forgot-password → code → new password → NO session → /sign-in
Google OAuth → arrives pre-verified, no code prompt
```

- Codes are 6 digits, expire after 10 minutes, allow 3 attempts, are **hashed at rest**, and are
  rate-limited to 3 sends per 60s (mirrored by a 60s cooldown on the "Resend code" button).
- Codes live in Better Auth's existing `verification` table — **no migration needed**.
- The passwordless `/sign-in/email-otp` endpoint is disabled (`disableSignUp: true`) so unknown
  emails can't create nameless, passwordless accounts.
- Better Auth **swallows and logs** send failures: a broken `RESEND_API_KEY` still returns
  "code sent" to the UI. Verify delivery in the Resend dashboard, not the browser.

### DashboardDataProvider Context

- **Fetches once** on dashboard mount: overview, credits (balance + prices), ledger, matches, resumes, job descriptions
- **refreshAll()** — after a match, a screening or a delete (balance and counts change)
- **refreshCredits()** — balance and ledger only
- Syncs all dashboard pages automatically (no redundant API calls)

## Getting Started

### Prerequisites

- Node.js 20+ (22 recommended)
- npm
- A Postgres database (Better Auth tables live in a `resume_match` schema)
- Python 3.12 + [uv](https://docs.astral.sh/uv/) and Docker (for the local backend and its Postgres)
- A [Resend](https://resend.com) account with a **verified sending domain** (auth codes won't
  deliver without one — the `onboarding@resend.dev` sandbox only mails your own account address)
- (Optional) Google OAuth 2.0 client, Upstash Redis, Umami instance

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mzeeshanaltaf/resume-match-ai.git
   cd resume-match-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Fill in the values (see `.env.example` for the full list). For local work, prefer a
   gitignored `.env.development.local` pointing at the local dev database (it overrides
   `.env.local` for `npm run dev`, so a production `DATABASE_URL` in `.env.local` is never used):
   ```env
   # Better Auth
   BETTER_AUTH_SECRET=            # openssl rand -base64 32
   BETTER_AUTH_URL=http://127.0.0.1:3000   # also the JWT issuer/audience
   DATABASE_URL=postgres://user:pass@host:5432/db

   # FastAPI backend
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000   # browser → backend (build-time)
   API_INTERNAL_URL=http://127.0.0.1:8000      # this server → backend (account deletion)
   INTERNAL_API_KEY=                           # must equal the backend's INTERNAL_API_KEY

   # Google OAuth (optional — button only shows when both are set)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=

   # Resend — auth verification / password-reset emails
   RESEND_API_KEY=re_...
   # Leave UNQUOTED: dotenv strips quotes locally but Docker/Coolify don't,
   # and Resend rejects a `from` containing literal quote characters (422).
   # Keep the address in sync with OTP_SENDER_EMAIL in src/lib/otp-sender.ts.
   RESEND_FROM_EMAIL=ResuMatchAI <noreply@verification.your-domain.com>

   # Contact form webhook (the only n8n use left)
   N8N_API_KEY=your_n8n_api_key

   # Umami (build-time) + Upstash (contact rate limit)
   NEXT_PUBLIC_UMAMI_SCRIPT_URL=
   NEXT_PUBLIC_UMAMI_WEBSITE_ID=
   UPSTASH_REDIS_REST_URL=
   UPSTASH_REDIS_REST_TOKEN=
   ```

4. **Create the auth tables** (once per database; includes the `jwks` table for the JWT plugin)
   ```bash
   # ensure the schema exists, then generate Better Auth tables inside it.
   # Pass DATABASE_URL explicitly so the CLI can't pick up a different .env file.
   psql "$DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS resume_match;"
   DATABASE_URL=... BETTER_AUTH_SECRET=... npx @better-auth/cli@latest migrate
   ```

5. **Run the backend** (separate terminal; see [`backend/README.md`](backend/README.md))
   ```bash
   cd backend
   docker compose -f docker-compose.dev.yml up -d   # dev Postgres on 127.0.0.1:5433
   uv sync
   cp .env.example .env     # set AUTH_JWKS_URL=http://127.0.0.1:3000/api/auth/jwks,
                            # AUTH_ISSUER=http://127.0.0.1:3000, CORS_ORIGINS=http://127.0.0.1:3000,
                            # INTERNAL_API_KEY=<same as the frontend>, plus OPENAI_API_KEY / FIRECRAWL_API_KEY
   uv run alembic upgrade head
   uv run uvicorn app.main:app --reload             # http://127.0.0.1:8000
   # no AI keys? run the dev server with fake AI and real sign-in instead:
   # DEV_REAL_AUTH=1 uv run python dev/dev_server.py
   ```

6. **Start the frontend**
   ```bash
   npm run dev
   ```

   Access at `http://127.0.0.1:3000` (not `localhost`)

### Build

```bash
npm run build
npm start
```

## API Endpoints

### Next.js (this app)
- `ALL /api/auth/[...all]` — Better Auth (sign-up/in/out, session, Google OAuth callback, the
  `email-otp/*` routes, `GET /api/auth/token` → a JWT for the backend, `GET /api/auth/jwks`,
  `POST /api/auth/delete-user`)
- `GET /api/auth/ok` — health check → `{ status: "ok" }`
- `POST /api/contact` — contact form → n8n (honeypot drop + per-IP rate limit)

### FastAPI backend (`NEXT_PUBLIC_API_URL`)
Everything else (resumes, job descriptions, matches, screenings, credits, overview, jobs/SSE,
data export) is a `/v1/*` call from the browser. The contract is
[`backend/openapi.json`](backend/openapi.json); the table of endpoints is in
[`backend/README.md`](backend/README.md).

## Key Features Explained

### Job Fit Analysis Workflow
1. **Step 1:** Select or upload your resume
2. **Step 2:** Enter job description (URL or paste text)
3. **Step 3:** Process JD and analyze match
4. **Step 4:** View results with score, strengths, gaps, and recommendations

### Resume Screening Workflow
1. **Step 1:** Upload multiple candidate resumes
2. **Step 2:** Enter job posting URL
3. **Step 3:** Click "Start Screening" to analyze all resumes
4. **Step 4:** View ranked results, sorted by match score

### Dashboard Overview
- **Stats cards:** Resumes, job descriptions and analyses
- **Recent analyses:** 5 most recent analyses
- **Quick actions:** Link to start new analysis

### History Page
- **Sortable table:** Search, filter, and sort by score or date
- **Tab switcher:** View Job Fit analyses or Resume Screenings separately
- **Detail modal:** Click to view full analysis report
- **Delete:** Removes only the analysis; the resume and job description stay (the credit spent isn't returned)

### Settings Page
- **Profile tab:** Update name, change password, sign out (via Better Auth)
- **Credits tab:** View balance and transaction history
- **Account tab:** Danger zone (future features)

## Performance Optimizations

- **Context-based caching:** Overview, matches, resumes and credits fetched once per session
- **Selective refreshing:** Only relevant data updates after workflows
- **Server Components:** Used for data fetching (layout, pages)
- **Client Components:** Used for interactivity (forms, uploads, dialogs)
- **Image optimization:** Next.js Image component for hero visuals
- **Code splitting:** Dynamic imports for heavy components
- **Dark mode:** CSS variables + next-themes (no layout shift)

## Styling & Theme

- **Color scheme:** Emerald green (#10b981) accent on slate theme
- **Dark mode:** System-aware with manual toggle
- **Typography:** DM Serif Display (display) + system fonts (body)
- **Components:** shadcn/ui with custom tailored styling
- **Animations:** CSS transitions + Lucide React icons

## Testing

Run the development server and test the flows:

```bash
npm run dev
```

1. **Job Fit Analysis:** Upload resume → enter job URL → view match score
2. **Resume Screening:** Upload 2+ resumes → enter job URL → screen all → ranked results
3. **History:** Navigate to History, search/filter, view details, delete entries
4. **Credits:** Check Settings → Credits, confirm balance updates after workflows
5. **Dark mode:** Click theme toggle in navbar, verify both themes work
6. **Email verification:** Sign up with a real address → code arrives → entering it signs you in.
   Check 3 wrong codes give `TOO_MANY_ATTEMPTS`, and that "Resend" delivers a *different* code.
7. **Password reset:** `/forgot-password` → code → new password → redirected to sign-in, old
   password rejected.

> Note: `requestPasswordReset` returns success for addresses with no account (anti-enumeration),
> so a made-up address that receives nothing is correct behaviour, not a bug.

## Deployment

The app runs on **Coolify** (self-hosted on a Hostinger VPS) and auto-deploys on
push to `main`:

```bash
git push origin main
# .github/workflows/deploy.yml triggers the Coolify deploy API (with retries)
```

- **Build:** nixpacks, Node 22, port 3000. `NIXPACKS_INSTALL_CMD=npm install`
  avoids cross-OS lockfile drift.
- **Env vars:** set in Coolify → application → Environment Variables. Mark every
  `NEXT_PUBLIC_*` and `BETTER_AUTH_URL` as **build-time**; secrets (including
  `RESEND_API_KEY` / `RESEND_FROM_EMAIL`) are runtime.
- **Paste `RESEND_FROM_EMAIL` without quotes.** dotenv strips quotes locally but
  Coolify passes the raw string through, so a quoted value fails in production
  only — with a Resend `422 validation_error` on the `from` field.
- **DB host:** inside the container use the docker0 gateway IP (e.g. `10.0.0.1`),
  not the public IP, in `DATABASE_URL`.
- **Auto-deploy secrets** (repo → Settings → Secrets → Actions):
  `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN` (deploy-scoped).

### Self-hosted (generic)

```bash
npm run build
npm start
```

Ensure all environment variables are set in your deployment platform.

## Troubleshooting

### "Failed to process job description"
- Check the backend is running and `NEXT_PUBLIC_API_URL` points at it
- A job link the backend can't scrape: use "Paste text" instead
- Backend `CORS_ORIGINS` must include the exact frontend origin (`http://127.0.0.1:3000` locally)

### Every API call returns 401 / "session expired"
- Backend `AUTH_ISSUER` must equal the frontend `BETTER_AUTH_URL` exactly, and `AUTH_JWKS_URL`
  must be `{BETTER_AUTH_URL}/api/auth/jwks` (the `jwks` table must exist: run the Better Auth migration)

### Credits not updating
- Check the backend logs; a failed analysis is refunded automatically
- Reload the dashboard (the balance is fetched from `/v1/credits`)

### Dark mode not persisting
- Check if `suppressHydrationWarning` is on `<html>` tag
- Verify `next-themes` is installed and provider is in root layout

### Resume upload fails
- PDF, DOCX or TXT only, max 5 MB and 5 pages; the message says which limit was hit
- Check the network tab for the backend's `{code, message}` error

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary. All rights reserved.

## Support

For issues, questions, or feature requests:
- Open a GitHub issue
- Contact: support@resumematchai.app
- Documentation: [Help & Support](https://resumematchai.app/help)

## Roadmap

- [ ] Cover letter generation
- [ ] Salary insights based on job description
- [ ] Interview question preparation
- [ ] Email integration for job alerts
- [ ] API for third-party integrations
- [ ] Team/enterprise features
- [ ] Mobile app (iOS/Android)

## Changelog

### v1.4.0 (Current)
- ✅ Dashboard runs entirely on the FastAPI backend (`backend/`); the n8n API routes and clients are gone
- ✅ Better Auth `jwt()` plugin: short-lived EdDSA tokens sent straight from the browser to the backend
- ✅ Typed API client with live job progress over SSE (polling fallback)
- ✅ Matches cost 1 credit (refunded on failure); signup credits are now granted by the backend
- ✅ Deleting a match keeps the resume and job description; the resume picker lists existing resumes
- ✅ Resumes can be PDF, DOCX or TXT; originals are previewed on demand through the API
- ✅ Account deletion hook: erases backend data first, aborts if that fails

### v1.3.0
- ✅ **Enforced email verification** via Better Auth's `emailOTP` plugin — 6-digit codes, hashed at
  rest, 10-minute expiry, 3 attempts, 3 sends/60s
- ✅ **Forgot-password flow** at `/forgot-password` (request code → set new password)
- ✅ Codes delivered by **Resend** with an HTML + plain-text email template
- ✅ New `/verify-email` screen; all four auth screens now share `auth-shell.tsx`
- ✅ Moved `<Toaster />` to the root layout (toasts on marketing pages previously rendered nothing)

### v1.2.0
- ✅ Migrated auth from Clerk to **Better Auth** (email/password + Google), backed by Postgres
- ✅ Signup credits now granted by a Better Auth `user.create` DB hook (Clerk webhook removed)
- ✅ New `/contact` page (progressive-enhancement form, honeypot + Upstash rate limiting)
- ✅ Swapped Vercel Analytics for self-hosted **Umami**
- ✅ Migrated hosting from Vercel to **Coolify** (Hostinger VPS) with GitHub Actions auto-deploy

### v1.1.0
- ✅ Full SEO baseline (robots.txt, XML sitemap, canonical URLs)
- ✅ Generated OG + Twitter card image (1200×630, emerald brand)
- ✅ Generated favicon + Apple home-screen icon
- ✅ PWA web manifest
- ✅ Organization + SoftwareApplication JSON-LD structured data
- ✅ Per-page metadata with keyword-rich titles on all marketing pages

### v1.0.0
- ✅ Job Fit Analysis with detailed scoring
- ✅ Resume Screening for recruiters
- ✅ Smart Dashboard with analytics
- ✅ Credit system and usage tracking
- ✅ Dark mode support
- ✅ Full mobile responsiveness
- ✅ Context-based data caching

---

Built with ❤️ using Next.js, FastAPI, and OpenAI
