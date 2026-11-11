# ResuMatchAI backend

FastAPI service that replaces the n8n workflows. The API surface is complete (phases 1-3):
foundation (config, auth, database + Alembic, object storage, credits), the documents pipeline
(resume and job description upload, validation gate, OCR, scraping, background jobs with live
progress), and matching, screening, tailored bullets, cover letters, overview, credits, data
export and account erase. The Next.js frontend calls it directly (phase 4).

The full machine-readable contract is [`openapi.json`](openapi.json) (regenerate with
`uv run python dev/export_openapi.py`; a test fails when it is stale). Request/response shapes,
SSE format, job result shapes and error codes are recorded in `docs/plan/handoff.md`.

## Endpoints

All under `/v1`, JWT-protected (`Authorization: Bearer <Better Auth JWT>`), except `/health` and
`/internal/*` (shared `X-Internal-Key`). Anything that can take more than a moment returns
`202 {job_id}`; progress and the outcome come from the job (`GET /jobs/{id}` or the SSE stream
`GET /jobs/{id}/events`).

| Endpoint | Notes |
|---|---|
| `POST /resumes` (multipart `file`, `mode=candidate\|recruiter`) | PDF/DOCX/TXT, 5 MB, 5 pages, 20k chars; free |
| `GET /resumes`, `GET /resumes/{id}/file`, `DELETE /resumes/{id}` | metadata list, streamed original, delete |
| `POST /job-descriptions` (`{url}` or `{text}`, `mode`) | URL is scraped with Firecrawl; free |
| `GET /job-descriptions` (`limit`, `offset`; total in `X-Total-Count`), `GET/DELETE /job-descriptions/{id}` | |
| `POST /matches` (`{resume_id, jd_id}`) | 1 credit, reserved first, refunded on failure; candidate or recruiter prompt by mode |
| `GET /matches` (optional `limit`, `offset`; total in `X-Total-Count`), `GET /matches/{id}`, `DELETE /matches/{id}` | newest first; delete removes only the match |
| `POST /matches/{id}/tailored-bullets` | included in the match credit, once per match, candidate matches only |
| `POST /matches/{id}/cover-letter` | 1 credit each time, candidate matches only |
| `POST /screenings` (`{resume_ids[], jd_id}`) | recruiter mode, 1 credit per resume (all or nothing up front), failed items refunded, ranked result |
| `GET /jobs/{id}`, `GET /jobs/{id}/events` | snapshot / Server-Sent Events (format in `app/routers/jobs.py`) |
| `GET /overview` | balance, counts, recent matches |
| `GET /credits`, `GET /credits/transactions` | balance + price list; full ledger newest first |
| `GET /account/export` | ZIP of everything the user owns, once per hour |
| `DELETE /internal/users/{id}` (body `{email}`) | erase all app data; called by Better Auth, not browsers |

Errors always look like `{code, message, details}`.

## Credits

A job that spends credits reserves them in the same transaction that creates its job row
(`JobRunner.submit(setup=...)`) and records what it reserved in `jobs.meta`. Refunds are derived
from data (`app/services/reservations.py`): a reservation is returned only if the thing it bought
does not exist and was not already refunded, so the failure hook, a failed screening item, a
shutdown cancel and startup recovery can never double-refund or refund a delivered analysis.

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
Next.js app (e.g. `http://127.0.0.1:3000`), which runs Better Auth's `jwt()` plugin. Also set
`CORS_ORIGINS=http://127.0.0.1:3000` and `INTERNAL_API_KEY` (shared with the frontend's
`INTERNAL_API_KEY`, used by account deletion). To run the whole stack without AI keys:
`DEV_REAL_AUTH=1 uv run python dev/dev_server.py` (real sign-in, fake OpenAI/Firecrawl).

Until then, `dev/dev_server.py` runs the real app with a throwaway signing key, prints a dev JWT,
and by default replaces only the OpenAI and Firecrawl network calls with fakes (no keys needed):

```bash
uv run python dev/dev_server.py                  # fake AI, prints "Authorization: Bearer" token
DEV_REAL_AI=1 uv run python dev/dev_server.py    # real OpenAI/Firecrawl from backend/.env
uv run python dev/smoke_phase3.py                # drives the whole API over real HTTP (starts its own server)
uv run python dev/export_openapi.py              # rewrites openapi.json
```

## Safety notes

- The backend reads `backend/.env` and the process environment only, **never** the repo-root
  `.env.local` (whose `DATABASE_URL` is the shared production database).
- Migration `0002` truncates the app tables. Do not run it against production until phase 8.
  Migration `0003` is additive (a `jobs.meta` column and a partial unique index).
- Test fixtures `DROP SCHEMA resume_match CASCADE`; they refuse any database that is not local
  with "test" in its name (`TEST_DATABASE_URL`).
