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

- **Frontend:** Next.js 16 (App Router), TypeScript, React 18, Tailwind CSS v4
- **UI Components:** shadcn/ui (Slate theme)
- **Auth:** Clerk
- **Backend:** n8n webhooks (AI/data processing)
- **Styling:** Tailwind CSS v4 with dark mode support
- **State Management:** React Context API
- **SEO:** robots.txt, XML sitemap, OG/Twitter image generation, JSON-LD structured data, PWA manifest

## Project Structure

```
src/
├── app/
│   ├── (marketing)/          # Public marketing pages
│   │   ├── page.tsx          # Landing page (metadata + SoftwareApplication JSON-LD)
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
│   │   ├── resume/           # Resume upload, list, delete
│   │   ├── jd/               # Job description submit
│   │   ├── match/            # Match analysis & history
│   │   ├── analytics/        # User analytics
│   │   ├── credits/          # Credit balance & history
│   │   └── webhooks/         # Clerk webhook handler
│   ├── icon.tsx              # Generated 32×32 favicon (ImageResponse)
│   ├── apple-icon.tsx        # Generated 180×180 Apple icon
│   ├── opengraph-image.tsx   # Generated 1200×630 OG image
│   ├── twitter-image.tsx     # Twitter card (reuses OG image)
│   ├── robots.ts             # Crawl rules (allow marketing, disallow dashboard/api)
│   ├── sitemap.ts            # XML sitemap for 4 public URLs
│   ├── manifest.ts           # PWA web manifest
│   └── layout.tsx            # Root layout with Clerk, theme providers & Organization JSON-LD
├── components/
│   ├── dashboard/
│   │   ├── match/            # Match workflow components
│   │   ├── screen/           # Screening workflow components
│   │   ├── history/          # History & details components
│   │   ├── settings/         # Settings components
│   │   ├── sidebar.tsx
│   │   ├── top-nav.tsx
│   │   └── credit-display.tsx
│   ├── marketing/            # Landing page components
│   ├── ui/                   # shadcn/ui primitives
│   └── theme-provider.tsx    # next-themes wrapper
├── contexts/
│   └── dashboard-data.tsx    # DashboardDataProvider context (caches analytics, matches, credits)
├── lib/
│   ├── n8n.ts                # n8n webhook client
│   ├── n8n-main.ts           # Resume processing, JD scraping, matching
│   ├── n8n-analytics.ts      # User analytics
│   ├── n8n-credits.ts        # Credit management
│   ├── n8n-data.ts           # Data retrieval (resumes, JDs, matches)
│   ├── n8n-delete.ts         # Data deletion
│   └── refresh-credits.ts    # Legacy credit refresh (kept for reference)
├── types/
│   └── n8n.ts                # TypeScript types for n8n responses
└── middleware.ts             # Clerk auth middleware
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

### DashboardDataProvider Context

- **Fetches once** on dashboard mount: analytics, matches, credit balance & history
- **refreshAll()** — called after Job Fit Analysis or Resume Screening completes
- **refreshCredits()** — called after credit-consuming actions (resume upload)
- Syncs all dashboard pages automatically (no redundant API calls)

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Clerk account (free tier)
- n8n instance with configured webhooks

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

   Add your Clerk and n8n credentials:
   ```env
   # Clerk (get from https://dashboard.clerk.com)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_WEBHOOK_SECRET=whsec_...

   # n8n (webhook base URL + webhook IDs)
   N8N_WEBHOOK_BASE_URL=https://your-n8n-instance.com/webhook
   N8N_API_KEY=your_n8n_api_key
   N8N_MAIN_WEBHOOK_ID=...
   N8N_ANALYTICS_WEBHOOK_ID=...
   N8N_CREDITS_WEBHOOK_ID=...
   N8N_DATA_WEBHOOK_ID=...
   N8N_DELETE_WEBHOOK_ID=...
   ```

4. **Start development server**
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
- **Profile tab:** Edit account information (via Clerk)
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

## Deployment

### Vercel (Recommended)

```bash
git push origin main
# Vercel auto-deploys on push to main
```

Add environment variables in Vercel dashboard → Settings → Environment Variables

### Self-hosted

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

### v1.1.0 (Current)
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
