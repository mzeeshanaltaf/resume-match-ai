# ResuMatchAI

An AI-powered SaaS application that matches resumes against job descriptions, providing intelligent scoring, gap analysis, and personalized recommendations using Claude AI via n8n workflows.

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
- Free tier: 5 analyses per month
- Pay-as-you-go for additional analyses
- Real-time credit tracking
- Transaction history

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS v4
- **UI Components:** shadcn/ui (Slate theme)
- **Auth:** [Better Auth](https://better-auth.com) — email/password + Google OAuth, with enforced email-OTP verification and password reset, backed by Postgres
- **Database:** Postgres — Better Auth tables (`user`, `session`, `account`, `verification`) in a `resume_match` schema
- **Backend:** n8n webhooks (AI/data processing)
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
│   │   ├── auth/[...all]/    # Better Auth handler (+ /api/auth/ok health check)
│   │   ├── contact/          # Contact form → n8n (honeypot + rate limit)
│   │   ├── resume/           # Resume upload, list, delete
│   │   ├── jd/               # Job description submit
│   │   ├── match/            # Match analysis & history
│   │   ├── analytics/        # User analytics
│   │   └── credits/          # Credit balance & history
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
│   └── dashboard-data.tsx    # DashboardDataProvider context (caches analytics, matches, credits)
├── lib/
│   ├── auth.ts               # Better Auth server config (pg Pool, providers, emailOTP, signup-credits hook)
│   ├── auth-client.ts        # Better Auth React client (signIn/signUp/signOut/useSession/emailOtp)
│   ├── email.ts              # Resend sender + OTP email template (server-only)
│   ├── otp-sender.ts         # OTP_SENDER_EMAIL — client-safe sender address constant
│   ├── get-user.ts           # getUserId() — server helper used by every protected API route
│   ├── rate-limit.ts         # Upstash sliding-window limiter (fails open)
│   ├── n8n.ts                # n8n webhook client
│   ├── n8n-main.ts           # Resume processing, JD scraping, matching
│   ├── n8n-analytics.ts      # User analytics
│   ├── n8n-credits.ts        # Credit management (signupCredits granted by DB hook)
│   ├── n8n-data.ts           # Data retrieval (resumes, JDs, matches)
│   └── n8n-delete.ts         # Data deletion
├── types/
│   └── n8n.ts                # TypeScript types for n8n responses
└── proxy.ts                  # Better Auth session-cookie gate for /dashboard/* (Next.js 16 middleware)
```

## Architecture

### Data Flow

```
User Action (Match/Screen) → API Route → n8n Webhook → Claude AI
    ↓
n8n processes & stores data
    ↓
API returns result
    ↓
UI updates via DashboardDataProvider context
    ↓
Dashboard automatically refreshes (Overview, History, Credits)
```

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

- **Fetches once** on dashboard mount: analytics, matches, credit balance & history
- **refreshAll()** — called after Job Fit Analysis or Resume Screening completes
- **refreshCredits()** — called after credit-consuming actions (resume upload)
- Syncs all dashboard pages automatically (no redundant API calls)

## Getting Started

### Prerequisites

- Node.js 20+ (22 recommended)
- npm
- A Postgres database (Better Auth tables live in a `resume_match` schema)
- n8n instance with configured webhooks
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

   Fill in the values (see `.env.example` for the full list):
   ```env
   # Better Auth
   BETTER_AUTH_SECRET=            # openssl rand -base64 32
   BETTER_AUTH_URL=http://localhost:3000
   DATABASE_URL=postgres://user:pass@host:5432/db

   # Google OAuth (optional — button only shows when both are set)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=

   # Resend — auth verification / password-reset emails
   RESEND_API_KEY=re_...
   # Leave UNQUOTED: dotenv strips quotes locally but Docker/Coolify don't,
   # and Resend rejects a `from` containing literal quote characters (422).
   # Keep the address in sync with OTP_SENDER_EMAIL in src/lib/otp-sender.ts.
   RESEND_FROM_EMAIL=ResuMatchAI <noreply@verification.your-domain.com>

   # n8n (webhook base URL + webhook IDs)
   N8N_WEBHOOK_BASE_URL=https://your-n8n-instance.com/webhook
   N8N_API_KEY=your_n8n_api_key
   N8N_MAIN_WEBHOOK_ID=...
   N8N_ANALYTICS_WEBHOOK_ID=...
   N8N_CREDITS_WEBHOOK_ID=...
   N8N_DATA_WEBHOOK_ID=...
   N8N_DELETE_WEBHOOK_ID=...

   # Umami (build-time) + Upstash (contact rate limit)
   NEXT_PUBLIC_UMAMI_SCRIPT_URL=
   NEXT_PUBLIC_UMAMI_WEBSITE_ID=
   UPSTASH_REDIS_REST_URL=
   UPSTASH_REDIS_REST_TOKEN=
   ```

4. **Create the auth tables** (once per database)
   ```bash
   # ensure the schema exists, then generate Better Auth tables inside it
   psql "$DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS resume_match;"
   npx @better-auth/cli@latest migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   Access at `http://127.0.0.1:3000`

### Build

```bash
npm run build
npm start
```

## API Endpoints

### Authentication & Contact
- `ALL /api/auth/[...all]` — Better Auth (sign-up/in/out, session, Google OAuth callback, and the
  `email-otp/*` routes: `send-verification-otp`, `verify-email`, `request-password-reset`,
  `reset-password`)
- `GET /api/auth/ok` — health check → `{ status: "ok" }`
- `POST /api/contact` — contact form → n8n (honeypot drop + per-IP rate limit)

### Resume Management
- `POST /api/resume/upload` — Upload and process a resume
- `GET /api/resume/list` — List all user's resumes
- `DELETE /api/resume/[id]` — Delete a resume

### Job Description
- `POST /api/jd/submit` — Submit and process a job description (URL or text)
- `GET /api/jd/list` — List all user's job descriptions
- `DELETE /api/jd/[id]` — Delete a job description

### Matching & Screening
- `POST /api/match/run` — Run resume-to-JD matching analysis
- `GET /api/match/history` — Get all past analyses
- `DELETE /api/match/[id]` — Delete an analysis

### Analytics & Credits
- `GET /api/analytics` — User statistics (resumes, JDs, matches processed)
- `GET /api/credits/balance` — Current credit balance
- `GET /api/credits/history` — Transaction history

## n8n Webhook Contract

All webhooks accept `POST` requests with:
- Header: `x-api-key: {N8N_API_KEY}`
- Body: JSON with `event_type` field routing to n8n switch nodes

### Webhook Summary

| Workflow | Purpose | Event Types |
|----------|---------|------------|
| **Main** | Resume processing, JD scraping, matching | `process_resume`, `scrape_jd`, `resume_match` |
| **Analytics** | User statistics | `user_analytics` |
| **Credits** | Credit balance & transactions | `signup_credits`, `get_remaining_credit`, `credit_history` |
| **Data** | Retrieve stored data | `get_resume`, `get_jds`, `get_job_match_summary` |
| **Delete** | Delete data | `delete_resume`, `delete_jd`, `delete_job_match_summary` |

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
- **Stats cards:** Total resumes, JDs, and matches processed
- **Recent analyses:** 5 most recent screening results
- **Quick actions:** Link to start new analysis

### History Page
- **Sortable table:** Search, filter, and sort by score or date
- **Tab switcher:** View Job Fit analyses or Resume Screenings separately
- **Detail modal:** Click to view full analysis report
- **Bulk delete:** Remove analyses from history

### Settings Page
- **Profile tab:** Update name, change password, sign out (via Better Auth)
- **Credits tab:** View balance and transaction history
- **Account tab:** Danger zone (future features)

## Performance Optimizations

- **Context-based caching:** Analytics, matches, and credits fetched once per session
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
- Verify n8n webhook URL is accessible
- Check `N8N_API_KEY` is correct
- Ensure job URL is valid and publicly accessible

### Credits not updating
- Check credit webhook response in n8n logs
- Verify `N8N_CREDITS_WEBHOOK_ID` is correct
- Clear browser cache and reload

### Dark mode not persisting
- Check if `suppressHydrationWarning` is on `<html>` tag
- Verify `next-themes` is installed and provider is in root layout

### Resume upload fails
- PDF file only (max 10 MB)
- Check network tab for API errors
- Verify `N8N_MAIN_WEBHOOK_ID` is correct

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

### v1.3.0 (Current)
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

Built with ❤️ using Next.js, Claude AI, and n8n
