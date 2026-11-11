# Session handoff log

Each session appends one section when it finishes. Read the whole file at the start of the next session; the newest section's "Next session starting point" is authoritative.

## Status

| Phase | Status | Branch | Last commit |
|---|---|---|---|
| 1 Backend foundation + DB | Done (2026-11-11) | `phase-1-backend-foundation` | see `git log` on branch |
| 2 Documents pipeline | Done (2026-11-11) | `phase-2-backend-documents` (stacked on `phase-1-backend-foundation`) | see `git log` on branch |
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

## Phase 2: Documents pipeline (done 2026-11-11, branch phase-2-backend-documents)

Phase 1's exit criteria were re-verified first: dev Postgres up, `alembic upgrade head` clean, `uv run pytest` = 102 passed / 1 skipped, as recorded. The branch is stacked on `phase-1-backend-foundation` (which also carries `cb2fb31`, untracking `n8n_workflows/`).

### Built
- `services/llm.py`: single OpenAI wrapper (`LLMService.parse` structured output, `.text` for vision OCR, `.decide` for the Decisions API) + `get_llm` dependency.
- `services/prompts.py`: n8n JD-extraction (extraction half only), candidate and recruiter match prompts (ported verbatim, split into `instructions` + user input; used in phase 3), OCR transcribe-only prompt, Decisions question definitions, `build_job_description_text` (the n8n "Data" node), `None` placeholders for the two new phase-3 prompts.
- `services/extraction.py`: magic-byte type detection, page counts, PDF (PyMuPDF) / DOCX (python-docx incl. tables and headers) / TXT extraction, scanned-PDF detection, page rendering + vision OCR.
- `services/validation.py`: Decisions gate (`predicate` + `choice`), threshold, refusal = rejection, specific messages.
- `services/scraping.py`: Firecrawl v2 batch scrape + bounded polling.
- `services/jobs.py`: in-process asyncio `JobRunner`, `jobs` table state, step events, SSE event channels, failure hook, startup recovery.
- `services/uploads.py`: streamed, size-capped multipart reader. `services/documents.py`: the resume/JD pipelines, dedup hashes, row to API converters.
- Routers `resumes`, `job_descriptions`, `jobs`; `schemas.py`; `main.py` wires the runner (`app.state.job_runner`), startup recovery and graceful shutdown.
- `backend/dev/dev_server.py`: real app + real HTTP with a throwaway JWT key; fake AI by default (`DEV_REAL_AI=1` for real).

### Files created / changed (key ones)
- New: everything listed above, `tests/{fakes,test_extraction,test_validation,test_llm,test_scraping,test_jobs,test_resumes_api,test_job_descriptions_api,test_jobs_api}.py`.
- Changed: `app/config.py` + `.env.example` (new settings below), `app/main.py`, `tests/conftest.py` (adds `Pipeline` / `make_pipeline` / `pipeline` fixtures; `db_app` also swaps in a test-bound job runner), `pyproject.toml` (`openai>=3.49`, the Decisions API needs a recent SDK) + `uv.lock`, `backend/README.md`, `CLAUDE.md`.

### API contract (phase 4 codes against this)

**Resume upload** `POST /v1/resumes`, multipart: `file` + `mode` (`candidate|recruiter`, required). Returns **`202 {job_id, status}`**. Immediate HTTP errors: 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_TYPE`, 422 `PAGE_LIMIT_EXCEEDED` / `EMPTY_FILE` / `UNREADABLE_DOCUMENT` / `PDF_PASSWORD_PROTECTED`, 409 `DUPLICATE_RESUME` (details `{resume_id, file_name}`) / `RESUME_LIMIT_REACHED`, 422 `VALIDATION_ERROR` (missing/invalid `mode` or `file`), 400 `BAD_REQUEST` (not multipart). Failures inside the job (read them from the job's `error`): `TEXT_LIMIT_EXCEEDED`, `UNREADABLE_DOCUMENT` (a scan that OCR could not read), `INVALID_RESUME` (message says what it looks like; details `{detected_type, probability, threshold}`), `DUPLICATE_RESUME` (concurrent-upload race), `LLM_*`.
**JD** `POST /v1/job-descriptions` JSON `{url | text, mode}` (exactly one of url/text; text >10 chars after whitespace collapse). Returns `202 {job_id}`. Immediate errors: 422 `VALIDATION_ERROR`, 422 `JD_TEXT_TOO_LONG`, 409 `DUPLICATE_JD` (details `{jd_id, jd_url}`). In the job: `INVALID_JD`, `SCRAPE_FAILED` / `SCRAPE_TIMEOUT`(504) / `SCRAPE_EMPTY`(422) / `SCRAPE_BUSY`(503) / `SCRAPE_UNAVAILABLE` / `SCRAPING_NOT_CONFIGURED`(503), `LLM_*`.
**Job success results**: resume `{resume_id, resume: ResumeOut}`; JD `{jd_id, job_description: JobDescriptionOut}`.
**Other error codes added**: `LLM_TIMEOUT`(504), `LLM_UNAVAILABLE`(502), `LLM_BAD_OUTPUT`(502), `LLM_ERROR`(502), `LLM_NOT_CONFIGURED`(503), `JOB_INTERRUPTED` (job error after a restart/shutdown), `FILE_NOT_FOUND` (row exists, object missing; 404), `NOT_FOUND` for another user's resource/job (never 403).
**Models**: `ResumeOut {id, file_name, file_size, mime_type, num_pages, num_characters, num_words, is_scanned, mode, created_at}` (never text or bytes); `JobDescriptionOut {id, jd_url, mode, validation_note, jd_object, created_at}`; `jd_object` keeps the n8n keys (`job_title, company_name, location, employment_type, description, responsibilities, requirements, benefits`) plus `is_job_description: true` and `validation_note`. API ids are `id` (DB columns stay `file_id` / `url_id`). `GET /v1/resumes` returns every resume (cap 50), newest first; `GET /v1/job-descriptions?limit&offset` (default 100, max 500) returns a plain array with the total in the `X-Total-Count` header.
**`GET /v1/jobs/{id}`**: `{id, kind, status: queued|running|succeeded|failed, steps: [{name, label, status: running|done|failed, started_at, finished_at}], result, error: {code, message, details}|null, created_at, updated_at, finished_at}`. Job kinds: `resume_upload`, `jd_submit`. Step names: resume `parsing, ocr (scanned PDFs only), validating, saving`; JD `scraping (URL only), validating, analyzing, saving`.
**SSE** `GET /v1/jobs/{id}/events` (`text/event-stream`, needs the `Authorization` header, so the browser client must use `fetch`, not `EventSource`):
```
id: 1
event: step                      # repeated per change: status running, then done|failed
data: {"job_id":"...","name":"parsing","label":"Reading your file","status":"running","started_at":"...","finished_at":null}

id: 7
event: succeeded                 # terminal, stream closes
data: {"job_id":"...","result":{...}}

event: failed                    # terminal, stream closes
data: {"job_id":"...","error":{"code":"INVALID_RESUME","message":"...","details":{...}}}

: keepalive                      # comment line every SSE_HEARTBEAT_SECONDS while idle
```
A connection always receives the **full history first** (replay), then live events, so a late/reconnecting client needs no snapshot call. After `JOB_CHANNEL_RETENTION_SECONDS` the history is rebuilt from the row (one `step` event per step in its final state, then the terminal event); the live "running" events are not reproduced then.

### Decisions API: the request/response actually used
SDK `openai 3.49.0` exposes `client.decisions.create(model, input, questions, ...)` (`POST /v1/decisions`). Request: `model=DECISION_MODEL`, `input=<document text as a plain string>`, `questions=[{type:"predicate", name:"is_resume"|"is_job_description", instructions}, {type:"choice", name:"document_type", instructions, choices:[{value, description} x6: resume, job_description, cover_letter, article_or_blog, company_page, other]}]`. Response `answers` come back in question order: predicate `{type, name, probability}`, choice `{type, name, choice, confidence, probabilities[]}`, or `{type:"refusal", name}`. Accept iff no refusal and predicate probability >= `DECISION_MIN_PROBABILITY`; the choice only words the rejection. No `service_tier`/`reasoning` (not part of the request), `safety_identifier` deliberately not sent. Document text is only ever the `input`, never inside `instructions`.

### Deviations from the plan (and why)
- **Dedup, page limit and per-user cap run inline, before the job**, not as job steps: they need no AI call and read better as direct HTTP errors (409/422) than as a failed job. Extraction, OCR, character limit, gate and storage run in the job. The per-user cap is therefore checked before any AI spend (the task list put it last).
- **Page limit for DOCX** uses `docProps/app.xml` `<Pages>` (written by Word/LibreOffice). Files without it (many generated DOCX) have `num_pages = NULL` and are bounded only by `MAX_RESUME_CHARS`. TXT has `num_pages = NULL`.
- **Streamed upload cap** is done by reading the raw `Request` through Starlette's `MultiPartParser` behind a counting wrapper (`services/uploads.py`) instead of `UploadFile` parameters (which would spool the whole body first). The cap on the raw stream is `MAX_UPLOAD_BYTES + UPLOAD_OVERHEAD_BYTES`; the file part itself is then checked against `MAX_UPLOAD_BYTES` exactly.
- **Refusal handling**: any refusal (predicate or choice) rejects, taking "a refusal answer is a rejection" literally; phase 7 may relax a choice-only refusal.
- **A blank text file** is rejected as `INVALID_RESUME` without a model call; OCR output shorter than `SCANNED_PDF_MIN_CHARS` is `UNREADABLE_DOCUMENT` (no gate call).
- **OpenAI SDK retries are off** (`max_retries=0` on the Responses client) so a flex timeout costs one timeout, then one retry on `LLM_FALLBACK_SERVICE_TIER`; the Decisions client uses `max_retries=2` and `DECISION_TIMEOUT_SECONDS`.
- No per-user rate limiting (the plan lists it under "later").
- JD extraction prompt is the extraction half of the n8n agent only; its validation half now lives in the Decisions gate.

### New commands / env vars / ports
- `uv run python dev/dev_server.py` (port 8000; prints a dev JWT; fake AI unless `DEV_REAL_AI=1`).
- New settings (all in `.env.example`): `DECISION_TIMEOUT_SECONDS=60`, `OCR_RENDER_DPI=150`, `UPLOAD_OVERHEAD_BYTES=65536`, `MAX_DOCX_UNCOMPRESSED_BYTES=52428800` (zip-bomb guard), `JOB_CHANNEL_RETENTION_SECONDS=120`, `SSE_HEARTBEAT_SECONDS=15`.
- `FIRECRAWL_API_KEY` and `OPENAI_API_KEY` are now needed for real runs (still never read from the repo-root `.env.local`).

### Verification run (commands + result)
- `uv run pytest`: **242 passed, 1 skipped** (the optional S3 test), ~16 s. New coverage: every upload limit (size incl. a chunked 100 MB body cut off after about the cap, declared Content-Length refused before reading, exactly-at-cap accepted, magic bytes vs name/MIME, 5 vs 6 pages, characters, per-user cap), ownership isolation between two users on every route, dedup per `(user_id, checksum)` (and the n8n hash recipe), invalid documents rejected and not stored (and retryable), scanned-PDF path to completion, decision threshold boundary, job lifecycle (queued, running, succeeded/failed, failure hook once and atomic, recovery, shutdown cancel, replay, keepalive), settings drive model / tier / effort / timeout / fallback, Firecrawl polling bounds and failures.
- **Manual smoke over real HTTP** (`dev/dev_server.py`, fake AI, dev JWT, dev Postgres): text PDF, DOCX, TXT and a 2-page scanned PDF all stored (`succeeded`); 6-page PDF -> `422 PAGE_LIMIT_EXCEEDED`; 6 MB file -> `413 FILE_TOO_LARGE`; PNG -> `415 UNSUPPORTED_TYPE`; repeat upload -> `409 DUPLICATE_RESUME`; JD by text and by URL created; SSE showed steps arriving incrementally (about 0.6 s apart with the fake delay); file streamed back with correct headers; delete 204; no token -> 401.
- **Live OpenAI / Firecrawl calls were NOT tried.** The Decisions and Responses request shapes were written against the SDK's own types (`openai 3.49.0`) and the Firecrawl v2 docs, and the whole pipeline is exercised with fakes. First real contact is phase 7; expect to tune `DECISION_MIN_PROBABILITY` and possibly question wording then. Unverified against the live service: that `gpt-6-luna` accepts `reasoning.effort` values from settings on the `flex` tier with image input, and the exact Firecrawl status strings beyond `scraping|completed|failed|cancelled`.

### Open issues / decisions deferred
- Phase 3 failure hook / refunds: `JobRunner.submit(..., on_failure=hook)` runs `hook(session, ctx, error)` in the same transaction that marks the job failed (once per failed job); `register_recovery(kind, handler)` does the same for jobs interrupted by a restart. A recovery handler only sees the `Job` row, so phase 3 must persist what it needs to refund (reservation amount/ids) in the job row (`result` is nullable jsonb, or `steps`) at reservation time.
- Credit accounts are still only created lazily by `GET /v1/me`; phase 3 should make the account creation (`credits.ensure_account`) part of every route that spends credits.
- Deleting a resume or JD deletes its matches (FK `ON DELETE CASCADE`, by design in Part 2); the UI (phase 6) should say so.
- `Pipeline.wait_idle` style waiting is test-only; production clients poll `GET /jobs/{id}` or read SSE.
- Real MinIO is still unverified (phase 8); resume upload/delete/file/sweep were exercised on the `local` backend only.

### Next session starting point
- Phase 3; first thing to do: `cd backend && docker compose -f docker-compose.dev.yml up -d && uv sync && uv run pytest` (expect 242 passed, 1 skipped), then add the match/screening/overview/credits/account features. Reuse `JobRunner` (with `on_failure` for refunds), `services/llm.py` (`parse` for match reports, add `bullets` / `cover_letter` tasks), `prompts.CANDIDATE_MATCH_INSTRUCTIONS` / `RECRUITER_MATCH_INSTRUCTIONS` + `candidate_match_input` / `recruiter_match_input` / `build_job_description_text`, `tests.conftest.make_pipeline` + `tests/fakes.py` (`FakeLLM.parse` returns a canned `JdExtraction`; extend it per schema) and `dev/dev_server.py`.
- Must not break: the `{code,message,details}` error shape, the SSE format above, `202 {job_id}` for long work, settings-only configuration, per-user `(user_id, checksum)` dedup, ownership-as-404, and nothing runs against the production DB before phase 8.
