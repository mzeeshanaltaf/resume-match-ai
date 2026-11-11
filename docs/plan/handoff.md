# Session handoff log

Each session appends one section when it finishes. Read the whole file at the start of the next session; the newest section's "Next session starting point" is authoritative.

## Status

| Phase | Status | Branch | Last commit |
|---|---|---|---|
| 1 Backend foundation + DB | Done (2026-11-11) | `phase-1-backend-foundation` | see `git log` on branch |
| 2 Documents pipeline | Not started | | |
| 3 Matching + account | Not started | | |
| 4 Frontend data layer | Not started | | |
| 5 Design system + marketing | Not started | | |
| 6 Dashboard redesign | Not started | | |
| 7 Local E2E verification | Not started | | |
| 8 Deployment | Not started | | |

## Baseline (before phase 1)

- Repo state: Next.js 16.1.6 app at repo root, n8n-backed API routes, Better Auth with email OTP (commit `f13c0d1`). Modified-but-uncommitted files in `n8n_workflows/` are unrelated to this plan; leave them alone.
- Prerequisites already done by the user: `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` in `.env.local`.
- Prerequisite pending: rotate the n8n "ResuMatch API Key" and update `N8N_API_KEY` in Coolify (contact form depends on it).
- Local dev environment: Windows 11, Git Bash/PowerShell, WSL2 quirks (use 127.0.0.1). Python tooling is `uv`; confirm it is installed in phase 1.

## Section template (copy for each finished phase)

```
## Phase N: <title> (done YYYY-MM-DD, branch phase-N-<slug>)

### Built
-

### Files created / changed (key ones)
-

### Deviations from the plan (and why)
-

### New commands / env vars / ports
-

### Verification run (commands + result, including failures)
-

### Open issues / decisions deferred
-

### Next session starting point
- Phase N+1; first thing to do:
- Anything the next phase must not break:
```

<!-- Append finished-phase sections below this line -->

## Phase 1: Backend foundation and database (done 2026-11-11, branch phase-1-backend-foundation)

### Built
- `backend/` FastAPI skeleton (Python 3.12, uv): settings, async DB layer, models, Alembic (2 revisions), JWT/JWKS auth, storage (local + s3) with orphan sweep, credits service, uniform error shape, `/health`, CORS (frontend origin only), a stub protected route `GET /v1/me`.
- Dockerfile (uv, port 8000, non-root, single worker, healthcheck) builds and serves `/health`.
- Dev Postgres via `backend/docker-compose.dev.yml` (port 5433, DBs `resumatch_dev` and `resumatch_test`).

### Live schema found (production `resume_match`, inspected read-only before writing models)
- `user_resume(file_id uuid pk, user_id, file_name, file_size, mime_type, num_pages, num_characters, num_words, is_scanned, is_resume, is_candidate, reasoning, file_binary_data bytea, file_text, checksum, created_at, updated_at)`
- `user_jds(url_id uuid pk, jd_url, user_id, is_candidate, is_jd, validation_note, jd_object jsonb, checksum, created_at, updated_at)`
- `job_match_summary(summary_id uuid pk, url_id, user_id, file_id NOT NULL, is_candidate, job_match_summary jsonb, created_at, updated_at)`, no FKs
- Credit tables are **`user_credit_accounts(user_id pk, current_balance, ...)`** and **`user_credit_transactions(transaction_id, user_id, transaction_type, credits_delta, reference_id, name_snapshot, description, created_at)`** (FK to accounts, CHECK on type and `credits_delta <> 0`, `current_balance >= 0`).
- `checksum` had a **global** unique index on both `user_resume` and `user_jds` (so one user's upload blocked another's); now `(user_id, checksum)`.
- Column names kept exactly; the five tables are as the plan assumed apart from the credit table names. Production had 12 resumes / 14 JDs / 13 matches / 10 accounts / 57 transactions of dummy data (will be truncated at phase 8).

### Files created / changed (key ones)
- `backend/app/{config,db,models,auth,errors,main}.py`, `app/services/{storage,credits}.py`, `app/routers/me.py`
- `backend/alembic/versions/0001_legacy_baseline.py`, `0002_reshape_for_fastapi.py`, `alembic/env.py`
- `backend/tests/` (102 tests), `.env.example`, `Dockerfile`, `docker-compose.dev.yml`, `README.md`
- Repo: only `backend/`, `docs/plan/`, and a short note in `CLAUDE.md`. n8n workflow JSON modifications were left untouched.

### Deviations from the plan (and why)
- **Two migrations, not one.** `0001_legacy_baseline` recreates the five n8n-era tables with `IF NOT EXISTS` (a no-op on production, bootstraps fresh dev/test DBs); `0002_reshape_for_fastapi` is the Part 2 reshape. Its downgrade restores the old shape but **empties the app tables** (files were never migrated out of `bytea`). 0001's downgrade is a deliberate no-op.
- Credit table names are the live ones (`user_credit_*`), see above.
- `jobs.error` is **jsonb** (`{code,message,details}`, same shape as API errors), not text; `jobs.status` CHECK is `queued|running|succeeded|failed`; `jobs` also has `finished_at`. Phase 2 may adjust.
- Kept the redundant `idx_user_credit_accounts_user_id` index in the models because it exists in production.
- `job_match_summary.url_id` stays nullable (as in production) although every match has a JD.
- `db_schema` is not a setting: the schema name is a structural constant (`app.models.SCHEMA`), used by models, raw SQL and `search_path`.
- Extra settings beyond the plan tables (needed by later phases, all in `.env.example`): `SCANNED_PDF_MIN_CHARS`, `MATCH_CREDIT_COST`, `COVER_LETTER_CREDIT_COST`, `SCREENING_CREDIT_COST_PER_RESUME`, `EMAIL_HASH_SALT`, `EXPORT_COOLDOWN_SECONDS`, Firecrawl base URL/timeouts, `AUTH_AUDIENCE`/`AUTH_*` cache and leeway, `STORAGE_SWEEP_*`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `DB_POOL_*`.
- Added `require_internal_key` (`X-Internal-Key`, constant-time compare; 503 when `INTERNAL_API_KEY` is empty) so phase 3's `/internal` route only needs to use it.
- `/health` is liveness only (no DB ping) so a DB blip cannot trigger container restarts.
- The orphan sweep is fully implemented (not a stub) and runs as a background task at startup, skipping objects younger than `STORAGE_SWEEP_MIN_AGE_SECONDS` (default 1 h) so an in-flight upload is never collected.

### New commands / env vars / ports
- `cd backend && docker compose -f docker-compose.dev.yml up -d` (Postgres on 127.0.0.1:5433; user/password/db `resumatch`/`resumatch`/`resumatch_dev`, plus `resumatch_test`).
- `uv sync` · `uv run alembic upgrade head` · `uv run uvicorn app.main:app --reload` (port 8000) · `uv run pytest`.
- Full env list: `backend/.env.example` (a test fails if a setting is missing from it). The backend reads `backend/.env` + process env only, **never** repo-root `.env.local` (that holds the production `DATABASE_URL`). Default `DATABASE_URL` is the local dev DB.
- Test-only env: `TEST_DATABASE_URL`, `REQUIRE_DB_TESTS=1`, `TEST_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`.

### Verification run (commands + result)
- `uv run pytest`: **102 passed, 1 skipped** (the skip is the optional S3 test).
- S3 test with `TEST_S3_*` set against a local **moto** S3 server: passed. It found a real bug (aiobotocore body streaming) that is fixed. **Real MinIO was not tested**: `minio/minio` and `quay.io/minio/minio` were not pullable here. Phase 8 must verify against the VPS MinIO.
- `alembic upgrade head` -> `downgrade -1` -> `upgrade head` on the dev DB: no errors; resulting schema inspected and matches Part 2; a test (`test_models_and_migrations_agree`) asserts models == migrated DB.
- Live: `uvicorn app.main:app` against the dev DB with a real HTTP JWKS: `/health` 200; `/v1/me` 401 without a token, 200 `{credits: 10}` with a valid EdDSA JWT, 401 for a wrong issuer; CORS preflight allows only the configured origin.
- Docker image builds; container answers `/health`.
- **Not run against production**: the migration truncates tables and the production DB is shared; it must only be run at phase 8 after the user confirms.

### Open issues / decisions deferred
- **Phase 4: the Better Auth `jwt()` plugin must include `email` in the token payload** (its default payload is the user object, which has it; keep it if `definePayload` is customised). The backend reads the `email` claim for the deleted-account check; if it is missing, that check silently does nothing.
- `EMAIL_HASH_SALT` must be set to a real secret in Coolify (phase 8) and never changed.
- Credits `reserve`/`refund` do not commit; callers own the transaction (reserve and commit **before** the AI call). `refund` is not idempotent: the jobs runner must refund once per failed job.
- Verify the S3 backend against real MinIO and the `/internal` + Better Auth flow end to end later (phases 3, 7, 8).

### Next session starting point
- Phase 2; first thing to do: `cd backend && docker compose -f docker-compose.dev.yml up -d && uv sync && uv run pytest`, then add extraction/validation/scraping/llm/prompts/jobs and the resume + JD routers. Use `app.services.credits`, `storage.resume_key()`, `AppError` and `get_settings()`; the `jobs` table is ready.
- Must not break: the `{code,message,details}` error shape, `current_user`/`current_claims` dependencies, settings-only configuration (no hardcoded model/limits), per-user `(user_id, checksum)` dedup, and the rule that nothing runs against the production DB before phase 8.
