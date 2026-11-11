# ResuMatchAI backend

FastAPI service that replaces the n8n workflows. Built so far: foundation (config, auth,
database + Alembic, object storage, credits) and the documents pipeline (resume and job
description upload, validation gate, OCR, scraping, background jobs with live progress).
Matching, screening, credits endpoints and account erase come in phase 3.

## Endpoints (documents pipeline)

All under `/v1`, JWT-protected. Uploads and JD submissions return `202 {job_id}`; progress and
the outcome come from the job (`GET /jobs/{id}` or the SSE stream `GET /jobs/{id}/events`).

| Endpoint | Notes |
|---|---|
| `POST /resumes` (multipart `file`, `mode=candidate\|recruiter`) | PDF/DOCX/TXT, 5 MB, 5 pages, 20k chars |
| `GET /resumes`, `GET /resumes/{id}/file`, `DELETE /resumes/{id}` | metadata list, streamed original, delete |
| `POST /job-descriptions` (`{url}` or `{text}`, `mode`) | URL is scraped with Firecrawl |
| `GET /job-descriptions` (`limit`, `offset`; total in `X-Total-Count`), `GET/DELETE /job-descriptions/{id}` | |
| `GET /jobs/{id}`, `GET /jobs/{id}/events` | snapshot / Server-Sent Events (format in `app/routers/jobs.py`) |

Errors always look like `{code, message, details}`; the codes the pipeline adds are listed in
`docs/plan/handoff.md` (phase 2).

## Run locally

```bash
cd backend
docker compose -f docker-compose.dev.yml up -d   # dev Postgres on 127.0.0.1:5433 (resumatch_dev + resumatch_test)
uv sync
cp .env.example .env                              # optional; defaults already target the local dev DB
uv run alembic upgrade head                       # creates/reshapes the resume_match schema
uv run uvicorn app.main:app --reload              # http://127.0.0.1:8000  (docs at /docs when ENVIRONMENT != prod)
uv run pytest                                     # DB tests skip if the dev Postgres is down (REQUIRE_DB_TESTS=1 to fail instead)
```

Authenticated calls need a Better Auth JWT; point `AUTH_JWKS_URL` / `AUTH_ISSUER` at the running
Next.js app (e.g. `http://127.0.0.1:3000`) once phase 4 adds the `jwt()` plugin.

Until then, `dev/dev_server.py` runs the real app with a throwaway signing key, prints a dev JWT,
and by default replaces only the OpenAI and Firecrawl network calls with fakes (no keys needed):

```bash
uv run python dev/dev_server.py                  # fake AI, prints "Authorization: Bearer" token
DEV_REAL_AI=1 uv run python dev/dev_server.py    # real OpenAI/Firecrawl from backend/.env
```

## Safety notes

- The backend reads `backend/.env` and the process environment only, **never** the repo-root
  `.env.local` (whose `DATABASE_URL` is the shared production database).
- Migration `0002` truncates the app tables. Do not run it against production until phase 8.
- Test fixtures `DROP SCHEMA resume_match CASCADE`; they refuse any database that is not local
  with "test" in its name (`TEST_DATABASE_URL`).
