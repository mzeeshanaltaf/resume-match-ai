# ResuMatchAI: FastAPI backend, full UI redesign, Coolify deploy

## Context

ResuMatchAI's whole backend is five n8n workflows called from Next.js API routes with a shared `x-api-key`. That setup has real defects (deleting a match also deletes its resume and JD, the scanned-PDF OCR path never responds, invalid documents are charged, matching is free, no ownership model beyond a trusted `user_id`, a live API key committed in workflow `pinData`). The UI is stock shadcn slate plus an emerald/serif-italic landing page that reads as generated, with invented metrics and a pricing table for tiers that do not exist.

Goal: replace n8n with a proper Python FastAPI service that the browser calls directly, redesign every screen in a distinct "editor's desk" direction documented in `DESIGN.md`, and deploy both apps on the Hostinger VPS via Coolify.

Decisions confirmed with the user:

| Topic | Decision |
|---|---|
| AI stack | OpenAI `gpt-6-luna` on the `flex` service tier for all generation (model and tier configurable), Firecrawl for job pages. No Mistral: scanned PDFs are read with `gpt-6-luna` vision. Matching and JD-extraction prompts ported from n8n |
| Document validation | OpenAI Decisions API (`POST /v1/decisions`, `gpt-6-luna`) gates every resume and JD; irrelevant documents are rejected |
| Upload limits | Hard, layered limits on size, pages and text length (see "Upload limits") |
| API access | Browser calls FastAPI directly at `api.resumatch.zeeshanai.cloud` with a Better Auth JWT (JWKS-verified) |
| Credits | 10 on signup; uploads and JD processing free; **1 credit per match analysis** |
| New features | Live progress, working OCR + DOCX/TXT, tailored resume bullets, cover letter draft, account deletion, data export |
| File storage | Resume files move from Postgres `bytea` to MinIO (S3-compatible) on the VPS, private bucket, served only through the API |
| Audience | Job seekers and recruiters equally |
| Design lane | "Editor's desk": resume as a paper document marked up by an exacting editor |
| Avoid | SaaS template layout, emerald glow/gradients, serif-italic headlines, templated dashboard |
| Pricing section | Replaced by an honest credits explanation, no tiers |

## Prerequisites (user)

1. Done: `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` are in `.env.local`. No Mistral key is needed.
2. Rotate the n8n "ResuMatch API Key": its value is committed in `pinData` of three workflow JSONs. The contact form still uses that key (`N8N_API_KEY`), so update it in Coolify after rotating.

## Part 1: FastAPI backend (`backend/`)

Monorepo: the Next.js app stays at the repo root, the new service lives in `backend/`.

**Stack**: Python 3.12, FastAPI, uv, SQLAlchemy 2 async + asyncpg, Alembic, pydantic-settings, `aioboto3` (MinIO), `openai` SDK (Responses API with structured outputs from Pydantic models, plus the Decisions API), httpx (Firecrawl), PyMuPDF (PDF text, page count, page rendering for vision OCR) + `python-docx`, `PyJWT[crypto]`, pytest + httpx.

```
backend/
  Dockerfile  pyproject.toml  alembic.ini  alembic/versions/
  app/
    main.py            # app factory, CORS (frontend origin only), /health
    config.py          # settings from env
    db.py              # async engine, search_path=resume_match
    auth.py            # JWT verify via JWKS (cached), current_user dependency
    models.py          # SQLAlchemy models
    schemas.py         # request/response + LLM output models
    routers/           # resumes, job_descriptions, matches, screenings, documents, credits, overview, jobs
    services/
      extraction.py    # PDF/DOCX/TXT text + page/word/char counts, vision OCR fallback
      validation.py    # Decisions API gate for resumes and JDs
      scraping.py      # Firecrawl scrape with bounded polling + failure handling
      llm.py           # single OpenAI wrapper: model, service tier, reasoning effort from settings
      prompts.py       # n8n matching + JD-extraction prompts, OCR prompt, 2 new ones
      storage.py       # object storage: S3/MinIO backend + local-folder backend for dev and tests
      account.py       # full data erase, export ZIP builder
      credits.py       # atomic reserve / refund, lazy signup grant
      jobs.py          # background job runner + progress events
  tests/
```

**Auth**: `Authorization: Bearer <jwt>`; verify signature (EdDSA) against `https://resumatch.zeeshanai.cloud/api/auth/jwks`, check `iss`/`aud`/`exp`, user id = `sub`. Every query is scoped by that user id; no `user_id` in request bodies.

**Model configuration** (`app/config.py`, every value overridable by env var, nothing hardcoded at call sites):

| Setting | Default | Used for |
|---|---|---|
| `LLM_MODEL` | `gpt-6-luna` | matching, JD field extraction, vision OCR, bullets, cover letter |
| `LLM_SERVICE_TIER` | `flex` | all Responses API calls; on flex timeout or capacity error, one retry on `LLM_FALLBACK_SERVICE_TIER` (default `default`, set empty to disable) |
| `LLM_REASONING_EFFORT` | `low` | per-task overrides available (`LLM_MATCH_REASONING_EFFORT`, ...) |
| `LLM_TIMEOUT_SECONDS` | `600` | flex requests can queue |
| `DECISION_MODEL` | `gpt-6-luna` | Decisions API (the only model it supports today) |
| `DECISION_MIN_PROBABILITY` | `0.7` | acceptance threshold, tuned against sample documents during testing |

The Decisions API docs do not mention service tiers, so `flex` is applied to Responses calls only.

**Scanned PDFs (replaces Mistral OCR)**: when a PDF's text layer yields under 20 characters, each page is rendered to an image with PyMuPDF and sent to `gpt-6-luna` as image input with a transcribe-only prompt; the result is stored as `file_text` with `is_scanned = true`. `gpt-6-luna` accepts images but not PDF files, hence the rendering step. The page limit below caps this at 5 images per upload.

**Validation gate (Decisions API)**: replaces the n8n "Resume Validator" prompt and the yes/no half of the JD extractor. One request per document on the extracted text, with two questions:
- `predicate`: "is this a resume/CV of one person" (or "is this a posting for one specific open job"), using the signal lists from the n8n prompts as instructions. Accept only if probability >= `DECISION_MIN_PROBABILITY`.
- `choice`: what the document actually is (`resume`, `job_description`, `cover_letter`, `article_or_blog`, `company_page`, `other`), used to give a specific rejection message ("This looks like a cover letter, not a resume"), since the Decisions API returns no free-text reasoning.

Rejected documents get `422 INVALID_RESUME` / `INVALID_JD`, are not stored, and never reach matching. A refusal answer is treated as a rejection. Order for a resume: limits, text extraction (OCR if scanned), decision gate, store. For a JD: limits, scrape (URL), decision gate on the scraped text, field extraction, store.

**Upload limits** (settings, enforced in layers so an oversized file is refused before it costs anything):

| Limit | Default | Enforced |
|---|---|---|
| File size | 5 MB (`MAX_UPLOAD_BYTES`) | browser before upload; server rejects on `Content-Length` and aborts the stream once the cap is passed, so a 100 MB body is never buffered; `413 FILE_TOO_LARGE` |
| File type | PDF, DOCX, TXT | by magic bytes, not the client MIME type; `415 UNSUPPORTED_TYPE` |
| Pages | 5 (`MAX_RESUME_PAGES`) | read from the PDF/DOCX before any extraction or AI call; `422 PAGE_LIMIT_EXCEEDED` |
| Extracted text | 20,000 characters (`MAX_RESUME_CHARS`) | after extraction, before the decision gate (n8n's 6,000 rejected ordinary two-page resumes) |
| JD pasted text | 20,000 characters (`MAX_JD_CHARS`) | request validation; scraped pages are truncated to the same length |
| Screening batch | 20 resumes (`MAX_SCREENING_RESUMES`) | request validation |
| Stored resumes | 50 per user (`MAX_RESUMES_PER_USER`) | on upload |

The UI states the limits next to the upload area and shows the specific reason on rejection.

**Endpoints** (`/v1`, all JWT-protected except `/health`):

| Endpoint | Behavior |
|---|---|
| `POST /resumes` (multipart, `mode=candidate\|recruiter`) | Size and type limits checked inline, then starts a job: dedup by checksum, page limit, extract text, vision OCR if scanned, character limit, Decisions gate. Invalid resumes are rejected and not stored. |
| `GET /resumes`, `GET /resumes/{id}/file`, `DELETE /resumes/{id}` | List (metadata only, no base64), stream the original file, delete. |
| `POST /job-descriptions` (`url` or `text`, `mode`) | Starts a job: dedup, Firecrawl scrape (URL), Decisions gate, field extraction (`gpt-6-luna`). Invalid JDs rejected, not stored. |
| `GET /job-descriptions`, `GET/DELETE /job-descriptions/{id}` | List, read, delete. |
| `POST /matches` (`resume_id`, `jd_id`) | Reserves 1 credit, starts a job: candidate or recruiter prompt by mode (`gpt-6-luna`), stores result. Refund on failure. 402 if no credits. |
| `POST /screenings` (`resume_ids[]`, `jd_id`) | One batch job, 1 credit per resume, per-resume progress, ranked result; failed items refunded. |
| `GET /matches`, `GET /matches/{id}`, `DELETE /matches/{id}` | History (ordered, paginated), full report, delete **only** the match. |
| `POST /matches/{id}/tailored-bullets` | New: rewritten summary + bullets for that job; included in the match credit. |
| `POST /matches/{id}/cover-letter` | New: cover letter draft; 1 credit. |
| `GET /jobs/{id}`, `GET /jobs/{id}/events` | Job snapshot and SSE stream of real steps (parsing, OCR, scraping, analyzing, done/failed). |
| `GET /overview` | Counts, balance, recent matches (replaces `get_user_data`). |
| `GET /credits`, `GET /credits/transactions` | Balance and ordered history. |
| `GET /account/export` | Streams a ZIP of everything the user owns (see "Data export"). Limited to one export per hour. |
| `DELETE /internal/users/{id}` | Service-to-service only (`X-Internal-Key`, not JWT): erases all app data for a user. Called by Better Auth during account deletion. |

**Object storage (MinIO)**: original resume files are stored under `resumes/{user_id}/{file_id}` in a private bucket; Postgres keeps metadata, extracted text and the `storage_key`. `storage.py` exposes `put / get_stream / delete / delete_prefix` with two backends selected by `STORAGE_BACKEND`: `s3` (MinIO in production, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`) and `local` (a folder, for local dev and tests, since the VPS MinIO is not exposed publicly). Files are never public and no presigned URLs are handed out: `GET /resumes/{id}/file` checks ownership and streams the object. Deleting a resume removes the row and then the object; a failed object delete is logged and retried by a startup sweep for keys with no row.

**Account deletion**: one flow that removes both the auth identity and the app data, and cannot leave one without the other:
1. Settings "Danger Zone": the user types their email to confirm and re-enters their password (Google-only users confirm through Better Auth's emailed deletion link).
2. Better Auth `user.deleteUser` is enabled in `src/lib/auth.ts`; its `beforeDelete` hook calls `DELETE /internal/users/{id}` on FastAPI with the shared `INTERNAL_API_KEY`. If that call fails, the hook throws and nothing is deleted.
3. FastAPI erases matches, generated documents, resumes (rows and MinIO objects under the user's prefix), job descriptions, jobs, credit account and transactions, in one DB transaction followed by the object deletes.
4. Better Auth then removes `user`, `session`, `account`; the browser is signed out and returned to the landing page.

To stop delete-and-re-register farming of the 10 signup credits, a salted hash of the deleted email is kept in `deleted_accounts` (no other personal data); a new account with the same email starts with 0 credits. This is stated in the confirmation text and the privacy page.

**Data export**: `GET /account/export` builds a ZIP into a temp file and streams it: `profile.json`, `resumes/` (original files plus `resumes.json` with metadata and extracted text), `job_descriptions.json`, `matches.json` (full reports), `generated_documents.json` (bullets, cover letters), `credit_transactions.json`, and a short `README.txt` describing each file. Bounded by the existing limits (50 resumes of at most 5 MB).

Jobs run as in-process asyncio tasks (single container, single worker) with state in a `jobs` table; jobs left `running` at startup are marked failed and refunded.

**Credits**: account created lazily on first authenticated request with the 10-credit signup bonus (`INSERT ... ON CONFLICT DO NOTHING`), so the Better Auth `user.create.after` hook and its webhook go away. Deduction and transaction row happen in one statement before the AI call; failure writes a `refund`.

**n8n behaviors deliberately changed** (the rest is ported 1:1: matching and JD-extraction prompts, dedup hash inputs, match report data shapes):
- one model (`gpt-6-luna`) instead of gpt-5-mini/nano; Decisions API instead of the validator prompt; vision OCR instead of Mistral; character limit raised from 6,000 to 20,000
- delete match no longer deletes resume/JD; resume and JD deletes actually work
- OCR path completes and stores the resume
- Firecrawl polling is bounded and handles failure
- invalid resume/JD is rejected instead of stored-and-reused
- match checks the resume/JD are valid and owned by the caller
- all lists ordered, no hidden 50-row cap, empty lists are `[]`
- consistent HTTP statuses with a single error shape `{code, message, details}`

## Part 2: Database (`resume_match` schema)

Alembic migration (version table inside `resume_match`), Better Auth tables untouched:

- Truncate the five app tables (dummy data, approved).
- `user_resume`, `user_jds`: checksum uniqueness becomes `(user_id, checksum)`.
- `user_resume`: drop `file_binary_data`, add `storage_key text NOT NULL` (table is truncated first, so no file migration is needed).
- New `deleted_accounts` (email_hash PK, deleted_at).
- `job_match_summary`: real FKs to resume and JD with `ON DELETE CASCADE`, index on `(user_id, created_at)`.
- `user_credit_transactions`: extend the type CHECK with `match_analysis`, `screening`, `cover_letter`.
- New `jobs` (id, user_id, kind, status, steps jsonb, result jsonb, error, timestamps).
- New `generated_documents` (id, match_id FK, kind `tailored_bullets|cover_letter`, content jsonb, created_at).
- Better Auth `jwks` table via `npx @better-auth/cli migrate` after adding the jwt plugin.

## Part 3: Frontend data layer

- `src/lib/auth.ts`: add the `jwt()` plugin (issuer/audience = `BETTER_AUTH_URL`); remove the `signupCredits` hook; enable `user.deleteUser` with the `beforeDelete` hook that calls FastAPI (new server-only env `API_INTERNAL_URL`, `INTERNAL_API_KEY`). `src/lib/auth-client.ts`: add `jwtClient()`.
- New `src/lib/api/client.ts`: typed fetch wrapper to `NEXT_PUBLIC_API_URL`, attaches a cached JWT (refreshed before expiry), parses the error shape, plus a small fetch-based SSE reader for job events. New `src/lib/api/types.ts` replaces `src/types/n8n.ts` (match report types kept as they are).
- Delete `src/lib/n8n.ts`, `n8n-main.ts`, `n8n-analytics.ts`, `n8n-credits.ts`, `n8n-data.ts`, `n8n-delete.ts`, `refresh-credits.ts`, and the API routes `resume/*`, `jd/*`, `match/*`, `analytics`, `credits/*`, `user-data`. Keep `api/auth/*` and `api/contact` (the contact webhook is a separate n8n workflow, out of scope; listed under recommendations).
- `src/contexts/dashboard-data.tsx`: refetch from `/v1/overview`, `/v1/matches`, `/v1/resumes`; PDF preview loads `/v1/resumes/{id}/file` on demand.
- Env: add `NEXT_PUBLIC_API_URL` (build-time), drop all `N8N_*` except `N8N_API_KEY`; update `.env.example`, `CLAUDE.md`, `README.md`.

## Part 4: UI redesign (impeccable)

Written first, before any UI code: **`PRODUCT.md`** (register, users, personality, anti-references, principles from the answers above) and **`DESIGN.md`** (tokens, type, components, motion rules) at the repo root, so later changes stay aligned. Image-generation probes are skipped: this harness has no native image generation.

**Direction: the editor's desk.** A resume is a sheet of paper; the product is the sharp editor who marks it up against the job. The signature element is hand-drawn proof marks (strike-throughs, circles, carets, margin notes) drawn as SVG strokes over real document text.

- **Scene**: someone at a laptop the evening before a deadline, reading a marked-up page. Light, paper-toned default; dark mode kept as "desk at night" through the same tokens.
- **Color** (OKLCH tokens, no hardcoded hex, no pure black/white): warm paper neutrals, deep ink for text and primary actions, red pencil as the single accent for corrections and gaps, proofreader blue for confirmed strengths. No emerald, no glows, no gradients. Score colors come from this set.
- **Type**: Schibsted Grotesk (a newsroom grotesque) for headlines and UI, upright only; Literata for document specimens and long reading text; one handwriting face used only for margin notes. Geist, DM Serif Display and the mono eyebrows are removed.
- **Motion** (`motion`, already installed): marks draw themselves via SVG path length, scroll-linked on the landing hero; product motion limited to 150 to 250 ms state changes; everything static under `prefers-reduced-motion`.

**Landing page** (`src/app/(marketing)/page.tsx`, rebuilt; no hero-badge / three cards / steps / pricing / dark CTA sequence):
1. Hero: plain-spoken headline beside a real resume page that gets marked up as you scroll, ending with the score written in the corner.
2. Two desks: candidate path (one resume, full markup) and recruiter path (a stack of resumes sorted into a ranked pile), each with its own call to action.
3. Anatomy of a report: one actual report, annotated to explain what each part tells you (replaces feature cards and invented metrics).
4. Credits, stated honestly: 10 free on signup, 1 credit per analysis, what is free.
5. Short FAQ (data retention described truthfully) and footer. Navbar gets a real mobile menu.

Also restyled in the same system: about, contact, privacy, terms, auth shell (sign-in, sign-up, verify, forgot password), 404, app icons, OG image. False claims removed from About ("analysed and discarded", unverified stats).

**Dashboard** (product register: familiar structure, restrained color, distinct through the document treatment rather than decoration):
- Shell: sidebar and top bar re-tokenized; working Help link.
- Overview: recent analyses as a ledger with credits and next action, replacing the three stat cards.
- Job Fit and Screener flows: step content redesigned; resume picker lists existing resumes (today it starts empty); accepts PDF, DOCX, TXT; the unclosable fake-progress modal becomes an inline live step list fed by job events.
- Report: a full page at `/dashboard/reports/[id]` instead of a dialog, laid out as the document with margin annotations; includes rationale, tailored bullets and cover letter tabs; print stylesheet replaces the `document.write` hack. `match-results.tsx` and `match-detail-dialog.tsx` (near-duplicates) merge into one report component.
- Screener results: ranked table with drill-down into each candidate's report.
- Settings "Account" tab: the "coming soon" placeholder becomes real: "Download my data" (ZIP export) and "Delete account" (inline typed-email + password confirmation, plain statement of what is erased and that it cannot be undone).
- History, Settings (profile, credits ledger): restyled; unused components removed (`jd-input.tsx`, `credit-badge.tsx`, `ui/progress.tsx`, `ui/tooltip.tsx`).

Key files: `src/app/globals.css` (token rewrite), `src/app/layout.tsx` and `(marketing)/layout.tsx` (fonts), everything under `src/components/marketing`, `src/components/dashboard`, and the shadcn primitives in `src/components/ui` re-themed through tokens.

## Part 5: Deployment (Coolify, using `COOLIFY_API_TOKEN_ROOT`)

Following the `add-app-to-coolify` skill:
0. MinIO, following the `add-minio-storage-to-coolify` skill: first check whether a MinIO service already runs on this Coolify instance (18+ apps live there); reuse it with a new private bucket and dedicated credentials if so, otherwise deploy one as a Coolify service on the shared Docker network with no public domain. Bucket `resumatch`, access key scoped to it.
1. DNS: `A api.resumatch` to `76.13.7.106` (Hostinger DNS).
2. New Coolify app in project ResuMatchAI: same repo, base directory `/backend`, Dockerfile build, port 8000, domain `https://api.resumatch.zeeshanai.cloud`, health check `/health`. Runtime env: `DATABASE_URL` (host `10.0.0.1`), `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `AUTH_JWKS_URL`, `AUTH_ISSUER`, `CORS_ORIGINS`, `INTERNAL_API_KEY`, `STORAGE_BACKEND=s3`, `S3_ENDPOINT` (internal Docker hostname), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`; model, tier and limit settings only where they differ from the defaults.
3. Run the Alembic migration and the Better Auth `jwks` migration against production.
4. Frontend app: add `NEXT_PUBLIC_API_URL` (build-time), `API_INTERNAL_URL` and `INTERNAL_API_KEY` (runtime), remove unused `N8N_*` vars.
5. `.github/workflows/deploy.yml`: deploy both apps (new secret `COOLIFY_BACKEND_APP_UUID`).
6. Commit and push to `main` to trigger the deploys; then deactivate the five n8n workflows (the contact workflow stays).

Order of work: backend + tests, migration, frontend data layer, PRODUCT.md/DESIGN.md, redesign, local end-to-end check, deploy.

## Verification

- Backend: `pytest` (OpenAI and Firecrawl mocked) covering auth rejection, ownership isolation between two users, dedup, every upload limit (including an oversized streamed body being cut off), decision threshold handling, credit reserve/refund under concurrency, delete semantics, job lifecycle, and that model and tier come from settings.
- Validation gate, live: a real resume, a scanned resume, a cover letter, a random article and a blank page as "resume"; a real posting, a company about page and a news article as "JD". Adjust `DECISION_MIN_PROBABILITY` from the observed probabilities.
- Live local run: `uvicorn` + `npm run dev` at `http://127.0.0.1:3000`; sign in; upload a text PDF, a scanned PDF, a DOCX, a 6-page PDF and a file over 5 MB (both must be refused); submit a JD by URL and by text; run a Job Fit match and a 3-resume screening; generate bullets and a cover letter; delete a match and confirm the resume and JD survive; confirm credit ledger entries.
- Storage: tests run against the `local` backend; on the VPS, upload a resume, confirm the object exists in the bucket and the DB row has no binary, preview it in the app, delete it and confirm the object is gone; confirm the bucket is not reachable without credentials.
- Export: download the ZIP for a populated account and check every file opens and matches what the app shows.
- Account deletion: with a throwaway account, delete and confirm zero rows for that user id in every `resume_match` table, no objects under its prefix, sign-in no longer works, and re-registering the same email yields 0 credits. Also confirm that a failing internal call aborts the deletion with the account intact.
- Frontend: `npx tsc --noEmit`, `npm run build`.
- Design: browser screenshots at mobile, tablet and desktop widths in light and dark for landing, auth, each dashboard screen and the report; check reduced motion, keyboard focus, contrast (WCAG AA); one critique-and-fix pass against DESIGN.md and the impeccable bans.
- Production: `https://api.resumatch.zeeshanai.cloud/health`, `/api/auth/ok`, one full match on the live site, Coolify logs clean.

## Recommended later (not in this plan)

- Credit top-ups / payments (Stripe or Lemon Squeezy); the ledger already supports it.
- Move the contact form off n8n onto FastAPI + Resend, then retire n8n for this app entirely.
- Per-user API rate limiting, LLM tracing (Langfuse) and error reporting.
- Interview question prep from a match report; comparing two resume versions against the same job.
