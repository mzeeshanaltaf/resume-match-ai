# Session handoff log

Each session appends one section when it finishes. Read the whole file at the start of the next session; the newest section's "Next session starting point" is authoritative.

## Status

| Phase | Status | Branch | Last commit |
|---|---|---|---|
| 1 Backend foundation + DB | Done (2026-11-11) | `phase-1-backend-foundation` | see `git log` on branch |
| 2 Documents pipeline | Done (2026-11-11) | `phase-2-backend-documents` (stacked on `phase-1-backend-foundation`) | see `git log` on branch |
| 3 Matching + account | Done (2026-11-11) | `phase-3-backend-matching` (stacked on `phase-2-backend-documents`) | see `git log` on branch |
| 4 Frontend data layer | Done (2026-11-11) | `phase-4-frontend-data-layer` (stacked on `phase-3-backend-matching`) | see `git log` on branch |
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

## Phase 3: Backend matching, generation, credits API, export and account erase (done 2026-11-11, branch phase-3-backend-matching)

Phase 2's exit criteria were re-verified first: dev Postgres up, `alembic upgrade head` clean, `uv run pytest` = 242 passed / 1 skipped, exactly as recorded; git clean on `phase-2-backend-documents`. This branch is stacked on it.

### Built
- **Matches**: `POST /v1/matches` (job), `GET /v1/matches`, `GET /v1/matches/{id}`, `DELETE /v1/matches/{id}` (only the match; its generated documents cascade, the resume and JD stay).
- **Screenings**: `POST /v1/screenings` (one batch job, per-resume progress, ranked result, per-item refunds).
- **Generated documents**: `POST /v1/matches/{id}/tailored-bullets` (free, once per match) and `POST /v1/matches/{id}/cover-letter` (1 credit each time), stored in `generated_documents`, returned inside `GET /v1/matches/{id}`. New prompts in `prompts.py`.
- **Credits/overview**: `GET /v1/credits` (balance + price list), `GET /v1/credits/transactions`, `GET /v1/overview`. These replace the `GET /v1/me` stub (deleted).
- **Account**: `GET /v1/account/export` (ZIP, once per hour) and `DELETE /internal/users/{id}` (erase).
- **Credit safety** (`services/reservations.py`): reservations are made inside `JobRunner.submit(setup=...)`, i.e. in the same transaction as the job row, and recorded in the new `jobs.meta`. Refunds are derived from data (delivered? already refunded?), so one function serves the failure hook, a failed screening item, a shutdown cancel and startup recovery with no double refund.
- **Startup recovery** (plan task 8): `services/runner.build_runner` registers the refund handler for kinds `match`, `screening`, `cover_letter`; it ran for real during the smoke run (an earlier killed run's leftover screening was failed and its credits refunded at the next boot).
- `backend/openapi.json` snapshot (+ `dev/export_openapi.py`, guarded by `tests/test_openapi.py`), `dev/smoke_phase3.py` (whole API over real HTTP).

### Files created / changed (key ones)
- New: `app/services/{matching,generation,reservations,account,runner}.py`, `app/routers/{matches,documents,screenings,credits,overview,account,internal}.py`, `app/{deps,openapi}.py`, `alembic/versions/0003_phase3_jobs_meta_bullets_unique.py`, `dev/{export_openapi,smoke_phase3}.py`, `openapi.json`, tests `test_{matches,screenings,documents,credits_overview,account,openapi}_api.py`.
- Changed: `app/main.py` (routers, `build_runner`, CORS `expose_headers`), `app/models.py` (`Job.meta`, partial unique index), `app/schemas.py`, `app/config.py` (+ `.env.example`), `app/services/{jobs,credits,prompts,documents}.py`, `tests/{conftest,fakes,test_jobs,test_schema,test_errors_and_main}.py`, `backend/README.md`, `CLAUDE.md`.

### API contract (phase 4 codes against `backend/openapi.json`; this section explains the parts OpenAPI cannot)

**Job kinds and results** (all `202 {job_id}`; read via `GET /v1/jobs/{id}` or the SSE stream, format unchanged from phase 2). The result shapes are published as OpenAPI components (`ResumeJobResult`, `JobDescriptionJobResult`, `MatchJobResult`, `DocumentJobResult`, `ScreeningResult`, plus `ApiError`), because a job's `result` is a free-form column.

| Kind | Started by | Steps (event `name`) | `result` on success |
|---|---|---|---|
| `match` | `POST /v1/matches` | `analyzing`, `saving` | `{match_id, match: MatchOut}` |
| `screening` | `POST /v1/screenings` | one `score:<resume_id>` per resume (running, then done/failed; labels `Scoring <file>`), then `ranking` | `ScreeningResult {jd_id, ranked[{rank, match_id, resume_id, file_name, overall_score_percent, score_confidence, rationale}], failed[{resume_id, file_name, error}], refunded_credits}` |
| `tailored_bullets` | `POST /v1/matches/{id}/tailored-bullets` | `generating`, `saving` | `{document_id, document: GeneratedDocumentOut}` |
| `cover_letter` | `POST /v1/matches/{id}/cover-letter` | `generating`, `saving` | `{document_id, document: GeneratedDocumentOut}` |
| `resume_upload`, `jd_submit` | phase 2 | unchanged | unchanged |

(`account_export` rows also appear in the `jobs` table; they are the export cooldown record, not something clients poll.) Steps of a screening run up to `SCREENING_CONCURRENCY` at a time, so `score:*` events interleave. A screening job **succeeds if at least one resume was scored**; failed items are listed in `result.failed` and already refunded. It fails (`SCREENING_FAILED`) only when every item failed.

**Models**
- `MatchListItem {id, resume_id, jd_id, mode, resume_file_name, job_title, company_name, jd_url, overall_score_percent, score_confidence, created_at}`; `MatchOut` = that + `report` + `documents[]`.
- `report` keeps the existing shape. Candidate mode: `{match_summary{overall_score_percent, score_confidence, key_strengths[], critical_gaps[]}, detailed_analysis{requirements_met[], gaps_and_weak_matches[]}, improvement_suggestions{high_priority[], medium_priority[], nice_to_have[]}, ats_optimization{keywords_to_add[], skills_to_rephrase[], section_recommendations[]}}`. Recruiter mode: `{match_summary{overall_score_percent, score_confidence, rationale}}` only. Scores are clamped to 0-100. `mode` is `candidate|recruiter`.
- `GeneratedDocumentOut {id, match_id, kind: tailored_bullets|cover_letter, content, created_at}`. Bullets content: `{summary, experience[{heading, bullets[{original|null, rewritten, why}]}], skills_to_emphasize[], notes|null}`. Cover letter content: `{salutation, paragraphs[], closing, signature, text}` (`text` is the whole letter, ready to copy).
- `GET /v1/matches` and `GET /v1/credits/transactions`: **no hidden cap**, newest first; optional `limit` (1-500 / 1-1000) and `offset`; total in `X-Total-Count` (now in CORS `expose_headers`, as are `Content-Disposition` and `Retry-After`; the phase-2 JD list header was previously unreadable by a browser). An empty list is `[]`.
- `CreditsOut {balance, costs{match, cover_letter, screening_per_resume}}` (so the UI never hardcodes prices). `CreditTransactionOut {id, transaction_type, credits_delta, reference_id, name_snapshot, description, created_at}`; a ledger row's `reference_id` is the match / document it paid for, and a refund carries the same id.
- `OverviewOut {balance, counts{resumes, job_descriptions, matches}, recent_matches[MatchListItem]}` (count from `OVERVIEW_RECENT_MATCHES`, default 5).

**Error codes added in phase 3** (plus everything from phases 1-2)
- `402 INSUFFICIENT_CREDITS` `details {needed, balance}` (for a screening `needed` is the batch total; nothing is reserved).
- `404 NOT_FOUND` for a missing or foreign resume / JD / match (never 403); `POST /screenings` lists the offending ids in `details.resume_ids`.
- `422 MODE_MISMATCH` (resume and JD added in different modes, or a candidate-mode item in a screening; `details {resume_mode, jd_mode, required_mode}`), `422 INVALID_RESUME` / `INVALID_JD` (flags/text missing on a stored row; not expected in practice), `422 TOO_MANY_RESUMES` `details {max_resumes, received}`, `422 CANDIDATE_ONLY` (bullets / cover letter on a recruiter match).
- `409 ALREADY_GENERATED` `details {document_id}` (second tailored-bullets request; can also be a job error on a race).
- `429 EXPORT_RATE_LIMITED` `details {retry_after_seconds}` + `Retry-After` header.
- Job errors only: `SOURCE_DELETED` (the resume/JD/match was deleted while the job ran; credit refunded), `SCREENING_FAILED` (`details.failed[]`).
- Internal: `403 FORBIDDEN`, `503 INTERNAL_API_DISABLED`, `502 ERASE_INCOMPLETE`, `422 VALIDATION_ERROR`.

**Internal erase contract (decided here; Phase 4 implements the caller)**
`DELETE {API_INTERNAL_URL}/internal/users/{user.id}` with header `X-Internal-Key: <INTERNAL_API_KEY>` and JSON body `{"email": "<user.email>"}`; the email is **required** (422 without it) so a hook that forgets it cannot silently re-open signup-credit farming. Not accepted with a JWT (403). Success is `200 {user_id, deleted{table: rows}, objects_deleted, cancelled_jobs}`; it is idempotent (unknown or already-erased user is 200 with zeros). Order: cancel the user's running jobs, delete all app rows plus the salted email hash in **one transaction**, then delete objects under `resumes/{user_id}/`. If only the object delete fails the answer is `502 ERASE_INCOMPLETE` (rows already gone, safe to retry); Better Auth's hook must treat any non-2xx as "abort the account deletion". I chose a body over a lookup in Better Auth's `user` table to keep the backend independent of Better Auth's schema. Email normalisation (trim, lowercase) is applied by the backend, so the hook can send `user.email` as is.

**Export** `GET /v1/account/export`: `application/zip`, `Content-Disposition: attachment; filename="resumatch-export-YYYYMMDD.zip"`. Contents: `profile.json` (user id, email from the JWT claim, balance, exported_at), `resumes/<id>-<name>` (original files), `resumes.json` (details, `file_in_export`, validation note, extracted text), `job_descriptions.json`, `matches.json` (full reports), `generated_documents.json`, `credit_transactions.json`, `README.txt`. A resume whose object is missing is listed with `file_in_export: null`. One export per `EXPORT_COOLDOWN_SECONDS` (3600) per user, enforced in the `jobs` table under a per-user advisory lock (survives restarts); a failed export releases its slot. The browser must fetch it with the `Authorization` header (blob download), not a plain link.

### Deviations from the plan (and why)
- **Migration `0003`** (additive): `jobs.meta jsonb` (refund bookkeeping that must not appear in `GET /jobs/{id}`) and a partial unique index so a match has at most one `tailored_bullets` document. The plan's schema had neither.
- **`GET /v1/me` removed** (its docstring said phase 3 replaces it); `GET /v1/credits` is now the generic authenticated route in tests.
- **Matches need the resume and JD in the same mode; screenings are recruiter-only.** The plan's `POST /matches` takes no mode, so it is derived from the resume's mode; a mismatch is `422 MODE_MISMATCH` rather than a guess. (Phase 4: the Job Fit wizard must list candidate-mode resumes/JDs, the Screener recruiter-mode ones.)
- **Tailored bullets and cover letters are candidate-mode only** (`CANDIDATE_ONLY`): a recruiter screening has no resume to tailor and no letter to send. Tailored bullets are once per match (they are "included in the match credit"; a second free call would be an unbounded free LLM call); cover letters can be regenerated, 1 credit each.
- **Both generation endpoints are jobs (`202`)**, not synchronous, because a flex-tier call can queue for minutes.
- **Screening items run with bounded concurrency** (`SCREENING_CONCURRENCY`, default 3) and each saves its own match row, so every ranked row drills down to `GET /v1/matches/{id}` and appears in history.
- **List endpoints return plain arrays + `X-Total-Count`** (same as phase 2's JD list), and `limit` defaults to "everything" for matches and transactions to honour "no hidden caps".
- **`JobRunner` changes** (phase 2 code): `submit(meta=, setup=)`, `JobContext.meta`, step persistence serialised with a lock (parallel steps could otherwise write an older snapshot last), success also writes the final steps, and `cancel_for_user`.
- **Failure-hook ordering**: a failed screening item is refunded immediately in its own transaction, the job-level hook refunds only what is left.
- **Real MinIO and real OpenAI are still unverified** (unchanged from phases 1-2). The four new LLM output schemas were checked offline against the OpenAI SDK's strict-mode conversion (all objects `additionalProperties: false`, all keys required, optionals nullable).

### New commands / env vars / ports
- `uv run python dev/export_openapi.py` (rewrite `backend/openapi.json`; commit it), `uv run python dev/smoke_phase3.py` (drives the whole API on port 8011 against the dev DB with a fresh user; writes its server log to `%TEMP%/resumatch-smoke-server.log`).
- New settings (in `.env.example`): `SCREENING_CONCURRENCY=3`, `OVERVIEW_RECENT_MATCHES=5`. `INTERNAL_API_KEY` (already a setting) is now used; it must be set in Coolify and in the frontend (`INTERNAL_API_KEY`, `API_INTERNAL_URL`).

### Verification run (commands + result)
- `uv run pytest`: **351 passed, 1 skipped** (the optional S3 test), ~70 s. New coverage: credit reserve/refund under concurrency across matches, screenings and mixed (8 simultaneous matches with 3 credits -> exactly 3 succeed; failures refund exactly once each), the 402 path, delete-match keeps resume and JD (and removes only its documents), ownership isolation on every new endpoint (and no-token 401 on each), export ZIP contents byte-for-byte for the original file, export cooldown (one per hour, per user, simultaneous requests allow exactly one, failure releases the slot, temp files removed), internal endpoint rejects a valid user JWT / wrong or missing key / unset key, full erase leaves zero rows in **every** table with a `user_id` column plus zero objects and leaves another user untouched, erase atomicity (rollback on DB failure, 502 + retry on storage failure), re-register with the same email yields 0 credits (case-insensitive) while a new email gets 10, startup recovery through the real lifespan, `JobRunner` additions, OpenAPI snapshot and plan-endpoint coverage.
- Mutation checks (temporarily broke the code, confirmed tests failed, restored): non-idempotent refund, refunding a delivered match, erase without cancelling jobs, export without the advisory lock.
- `alembic upgrade head` -> `downgrade -1` -> `upgrade head` on the dev DB: clean; `test_models_and_migrations_agree` passes with the new index.
- **Manual smoke over real HTTP** (`dev/smoke_phase3.py`, real uvicorn, SSE, dev JWT, fake AI, dev Postgres): all 48 checks pass: upload + JD with SSE, match (10 -> 9), bullets free and once, cover letter (9 -> 8), 3-resume screening ranked (8 -> 5), history/overview/ledger, export ZIP + 429, delete match keeps resume and JD, erase rejects JWT and wrong key then succeeds, re-register gets 0 credits.
- **Not run**: real OpenAI/Firecrawl/MinIO, production DB, Better Auth. The smoke script found no server bug, but its first version hung because it stopped reading the server's stdout pipe (fixed by logging to a file); worth knowing if you script a server again.

### Open issues / decisions deferred
- **Phase 4: the Better Auth `beforeDelete` hook must send the email** (contract above) and abort on non-2xx. The `jwt()` payload must keep `email` (the lazy credit account and the deleted-email check read it; without it the 0-credit rule silently does nothing).
- A still-valid JWT (about 15 minutes) of an erased user can recreate an empty credit account (0 credits if the email hash matches); it holds no data. Acceptable, noted for phase 8 hardening.
- Deleting a resume or JD cascades to its matches and their documents (by design, Part 2); the Phase 6 UI should say so before confirming. Credits spent on a deleted match are not returned.
- Screening quality/shape of real model output is untested live; phase 7 should also tune `LLM_MATCH_REASONING_EFFORT` and check the candidate report stays inside the strict schema in practice.
- `X-Total-Count` header on the JD list needed the CORS exposure added here; phase 4 should read it for pagination.

### Next session starting point
- Phase 4; first thing to do: `cd backend && docker compose -f docker-compose.dev.yml up -d && uv sync && uv run pytest` (expect 351 passed, 1 skipped), read `backend/openapi.json` and the "API contract" sections of phases 2 and 3 above, then add the `jwt()` plugin (include `email`), the `beforeDelete` hook calling `DELETE /internal/users/{id}`, the typed client + SSE reader, and delete the n8n code. Use `uv run python dev/dev_server.py` as the backend while building (fake AI, prints a JWT; but Phase 4 needs the real JWKS flow, so point `AUTH_JWKS_URL` / `AUTH_ISSUER` at the Next.js app).
- Must not break: the `{code,message,details}` error shape, the SSE format, `202 {job_id}` for long work, credit reservation inside `submit(setup=)` with refunds only via `services/reservations.py`, ownership-as-404, settings-only configuration, `openapi.json` kept current (a test enforces it), and nothing runs against the production DB before phase 8.

## Phase 4: Frontend data layer (done 2026-11-11, branch phase-4-frontend-data-layer)

Phase 3's exit criteria were re-verified first: dev Postgres up, `uv run pytest` = **351 passed, 1 skipped** exactly as recorded, `backend/openapi.json` present, git clean on `phase-3-backend-matching`. No gap. This branch is stacked on it.

### Built
- **Auth** (`src/lib/auth.ts`): `jwt()` plugin (EdDSA, `issuer` = `audience` = `BETTER_AUTH_URL`, payload reduced to `{email}` + `sub`), `signupCredits` hook removed, `user.deleteUser` enabled with a `beforeDelete` that calls `DELETE {API_INTERNAL_URL}/internal/users/{id}` (`X-Internal-Key`, body `{email}`) and throws a Better Auth `APIError` (502 / 503) on any failure, so nothing is deleted unless the backend erased first. `auth-client.ts`: `jwtClient()`, `getApiToken()` (cached JWT, refreshed 60 s before expiry, shared in-flight request, generation counter so a fetch started before sign-out can't repopulate the cache), `clearApiToken()`, `signOut` wrapped to clear it.
- **API layer** `src/lib/api/`: `client.ts` (typed `api.*` for every endpoint the UI needs, `ApiError`, one token refresh + retry on 401, fetch-based SSE reader, `waitForJob<T>()` with polling fallback), `types.ts` (from `openapi.json`, match report types kept), `errors.ts` (`describeError`: 402 shows "You need N credits for this but have M", job/LLM/scrape/limit codes get specific text), `limits.ts` (UI-side upload limits).
- **Dashboard** rewired: `contexts/dashboard-data.tsx` (overview, credits + prices, ledger, matches, resumes, JDs), overview page, history table (+ new `resume-preview-dialog.tsx`: PDF fetched on demand from `/v1/resumes/{id}/file`, DOCX/TXT download-only), match stepper, screen stepper, resume upload, both pickers (now list existing resumes, filtered by mode), results components, credits section, report dialog (fetches `GET /v1/matches/{id}` when opened), `pdf-viewer.tsx` (now takes a `Blob`).
- **Progress**: `ShimmeringProgressDialog` is now driven by real job steps instead of timers (all five uses: resume upload, JD x2, match, screening).
- **Removed**: `src/lib/n8n*.ts`, `refresh-credits.ts`, `src/types/n8n.ts`, API routes `resume/*`, `jd/*`, `match/*`, `analytics`, `credits/*`, `user-data`, plus the dead `jd-input.tsx` and `credit-badge.tsx`. `grep -ri n8n src` now matches only `src/app/api/contact/route.ts`.
- **Env/docs**: `.env.example` (new vars, N8N reduced to `N8N_API_KEY`), `CLAUDE.md` (architecture, run-both-apps commands, env, dev setup), `README.md`, `backend/README.md`, `backend/dev/dev_server.py` (`DEV_REAL_AUTH=1`), `scripts/e2e/` (the verification scripts below).

### Files created / changed (key ones)
- New: `src/lib/api/{client,types,errors,limits}.ts`, `src/components/dashboard/history/resume-preview-dialog.tsx`, `scripts/e2e/*`.
- Changed: `src/lib/{auth,auth-client}.ts`, `src/contexts/dashboard-data.tsx`, `src/app/(dashboard)/dashboard/{page,history/page}.tsx`, `src/components/dashboard/{history,match,screen,settings}/*`, `shimmering-progress-dialog.tsx`, `src/components/pdf-viewer.tsx`, `src/app/(marketing)/privacy/page.tsx` (one sentence), `.env.example`, `.gitignore`, `CLAUDE.md`, `README.md`.

### Behaviour the UI now respects
- **Match = 1 credit** (price read from `GET /v1/credits`, never hardcoded). The analyze step states the cost and balance and disables the button when the balance is too short; a server `402 INSUFFICIENT_CREDITS` shows its own message. After any match/screening the balance and history are refetched (also on failure, since a refund changes them).
- **Screening**: all-or-nothing credit check up front (cost shown), up to 20 resumes, failed items listed with their reason and the refunded amount.
- **Delete match** keeps resume and JD (confirm text says so and that the credit isn't returned).
- **Modes**: Job Fit lists/uploads `candidate` resumes and JDs, the Screener `recruiter` ones. Dedup is per mode, so a `409 DUPLICATE_RESUME` / `DUPLICATE_JD` is handled by reusing the existing item (toast says so).
- Upload area states "PDF, DOCX or TXT · max 5 MB · up to 5 pages"; files are pre-checked in the browser; server rejections (page limit, text limit, invalid document, scanned-but-unreadable, ...) show the backend's specific message.

### Deviations from the plan (and why)
- **Separate local DB for Better Auth.** The repo-root `.env.local` holds the **production** `DATABASE_URL`, so there was no "dev" Better Auth DB. The Better Auth tables + `jwks` were created in the local docker Postgres (`resumatch_dev`, same DB the backend uses) with `DATABASE_URL` passed explicitly to `npx @better-auth/cli@latest migrate` (never in `.env.local`'s reach). Dev values live in a gitignored `.env.development.local` (Next loads it after `.env.local` for `next dev`, so production values can't leak into a dev run; verified with `@next/env`). **Production has no `jwks` table yet**: Phase 8 must run the migration there.
- **`jwtClient() as never`** in `auth-client.ts`: better-auth 1.6.24's `jwtClient().getActions` type is rejected by `createAuthClient`, and that rejection also erases other plugins' typings (`emailOtp` stopped existing). Runtime is fine. The token is read with `authClient.$fetch("/token")` (no plugin typings needed). Drop the cast when the library is fixed.
- **JWT payload is `{email}` + `sub`**, not the whole user row (the default). The plan only requires `email`.
- **Deleted `credit-badge.tsx` and `jd-input.tsx` now** (the plan lists them for Phase 6): both imported modules deleted in this phase and nothing used them.
- **Privacy page**: changed the one sentence that said n8n runs the AI pipeline (it would now be false, and the exit criterion greps n8n). Other stale claims there (Clerk, "processed in memory and not persisted") are untouched: Phase 5.
- **Retry bug fixed on the way**: the old "Retry" after a failed JD in the match stepper set state to the value it already had, so it did nothing. It now restarts the job.
- Overview stat labels renamed to what the API counts ("Resumes", "Job Descriptions", "Analyses"); the empty-state badge now says "1 credit per analysis · uploads are free".
- `ShimmeringProgressDialog` got a `DialogTitle` (sr-only): it was a Radix console error on every open.
- Credits ledger in the context is capped at the 200 newest rows (`LEDGER_LIMIT`); the JD list is fetched with `limit=500` (the API's maximum) because its default would silently cap at 100.
- `api.matches.tailoredBullets/coverLetter` exist in the client (typed) but no UI calls them yet; there is no `api.account.export` yet. Phase 6 wires/adds them.
- Backend: only `dev/dev_server.py` changed (`DEV_REAL_AUTH=1`: real JWKS verification instead of the throwaway key; `AUTH_ISSUER`/`CORS_ORIGINS` then come from `backend/.env`). No API or schema change, so `openapi.json` and the 351 backend tests are unaffected.

### New commands / env vars / ports
- **Run everything locally** (exact):
  1. `cd backend && docker compose -f docker-compose.dev.yml up -d && uv sync && uv run alembic upgrade head`
  2. Once: create `backend/.env` (`AUTH_JWKS_URL=http://127.0.0.1:3000/api/auth/jwks`, `AUTH_ISSUER=http://127.0.0.1:3000`, `CORS_ORIGINS=http://127.0.0.1:3000`, `INTERNAL_API_KEY=<x>`) and root `.env.development.local` (`DATABASE_URL=postgresql://resumatch:resumatch@127.0.0.1:5433/resumatch_dev`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://127.0.0.1:3000`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`, `API_INTERNAL_URL=http://127.0.0.1:8000`, `INTERNAL_API_KEY=<x>`, `RESEND_API_KEY=<dummy>`). Then `DATABASE_URL=postgresql://resumatch:resumatch@127.0.0.1:5433/resumatch_dev BETTER_AUTH_SECRET=<same> BETTER_AUTH_URL=http://127.0.0.1:3000 RESEND_API_KEY=<dummy> npx @better-auth/cli@latest migrate -y`.
  3. Backend: `cd backend && uv run uvicorn app.main:app --reload` (real AI; needs `OPENAI_API_KEY` + `FIRECRAWL_API_KEY` in `backend/.env`) **or** `DEV_REAL_AUTH=1 uv run python dev/dev_server.py` (fake AI, real sign-in; `DEV_FAKE_DELAY=<s>` slows the fake calls).
  4. Frontend: `npm run dev`, open **http://127.0.0.1:3000**.
  5. Dev users can't receive the OTP email (dummy Resend key on purpose): sign up, then `update resume_match."user" set "emailVerified" = true where email = '…'` in the dev DB, then sign in.
- New env vars (frontend): `NEXT_PUBLIC_API_URL` (**build-time**), `API_INTERNAL_URL`, `INTERNAL_API_KEY` (runtime, must equal the backend's). Dropped: `N8N_WEBHOOK_BASE_URL`, `N8N_*_WEBHOOK_ID`. Kept: `N8N_API_KEY` (contact form). `BETTER_AUTH_URL` must equal the backend's `AUTH_ISSUER` exactly.
- No new npm dependencies.

### Verification run (commands + result, including failures)
- `npx tsc --noEmit`: clean. `npm run build`: passes (22 routes; no api routes except auth + contact).
- `grep -ri n8n src`: only `src/app/api/contact/route.ts`.
- **Real stack, mocked AI**: Next.js dev server (127.0.0.1:3000, local dev Postgres) + `DEV_REAL_AUTH=1` backend (**fake OpenAI/Firecrawl; no real LLM or scrape was called**). `scripts/e2e/e2e-ui.mjs` (headless Chrome, real pages), **all 29 checks pass**: UI sign-in, new user shows 10 credits, upload area states limits, a >5 MB file is refused in the browser, a 6-page PDF is refused by the server with "This document has 6 pages; the limit is 5.", upload via job + SSE, JD by pasted text, cost/balance stated, match completes and credits go 10 -> 9, history row + View Report loads the full report on demand, PDF preview renders from `/v1/resumes/{id}/file`, delete match -> **resume and JD rows survive, match row gone (checked in SQL)**, picker lists the existing resume, duplicate upload reuses the existing copy, ledger shows `+10` and `-1`, screener doesn't list candidate-mode resumes, 3-resume screening ranked and credits 9 -> 6, screener history tab lists 3, balance forced to 0 -> analyze button disabled with the "not enough credits" message. Three of the screenshots (upload progress, history, screening results) were looked at and render correctly.
- `scripts/e2e/e2e-delete.mjs`, **all 18 checks pass**: JWT is EdDSA with `iss` = `aud` = `BETTER_AUTH_URL`, claims only `sub`/`email`/`iat`/`exp`/`iss`/`aud`; backend accepts it (lazy account = 10 credits), rejects no token and a tampered token; with the backend **stopped**, `POST /api/auth/delete-user` returns 502 and the user, session and resume are intact; with it running, deletion returns 200, **zero rows in all 6 tables with `user_id`**, no objects left, Better Auth user/sessions gone, sign-in returns 401, re-registering the same email gives **0 credits**.
- `scripts/e2e/e2e-sse.mjs`: only `/v1/jobs/{id}/events` was requested (no polling) and the dialog showed the backend's live label "Checking that it's a resume". (Its second regex demanded the instant "Reading your file" step, which can't be observed: a flaw in that check, not the app. Noted in the script's README.)
- Backend suite not re-run after the end (only `dev/dev_server.py` changed, which no test imports); it was 351 passed / 1 skipped at the start.
- **Not run**: real OpenAI / Firecrawl / MinIO, the production DB, Google sign-in, a real OTP email, the SSE **polling fallback** and the 401-refresh-retry path (written, not exercised), a visual pass in dark mode / mobile widths (Phase 7).

### Temporary UI that Phase 6 replaces
- `shimmering-progress-dialog.tsx` (unclosable modal, now live): used by `resume-upload.tsx`, `match-stepper.tsx` (JD + analyze), `screen-stepper.tsx` (JD + screening). Phase 6: inline step list.
- `match-results.tsx` and `history/match-detail-dialog.tsx` are still near-duplicates (both now take `MatchOut`); `handlePrint` still builds HTML with `document.write` from **unescaped report text** (pre-existing; the report text comes from model output, so it is a real injection path). Phase 6's print stylesheet removes it.
- Screener results show rank/score/rationale only; no drill-down yet (a ranked row has `match_id`, so `GET /v1/matches/{id}` is ready).
- Settings "Account" tab is still the "coming soon" placeholder; no UI calls `delete-user` or the export. Contract for Phase 6: `authClient.deleteUser({ password })` for email users; Google-only users have no credential account, so send no password and rely on a **fresh session** (`freshAge`, 1 day by default; otherwise Better Auth answers `SESSION_EXPIRED` and the user must sign in again). `sendDeleteAccountVerification` is deliberately **not** configured: setting it would make the password flow email a link instead of deleting. After deleting, call `clearApiToken()` (the wrapped `signOut` does it; `deleteUser` itself doesn't) and redirect.

### Open issues / API gaps / decisions deferred
- **No endpoint exposes the upload limits** (5 MB, 5 pages, 20 resumes): `src/lib/api/limits.ts` duplicates the backend defaults. Suggest adding them to `GET /v1/credits` or a `/v1/limits`; until then changing a backend limit means changing `limits.ts`.
- A **concurrent-upload race** yields `DUPLICATE_JD` inside the job with details `{jd_url}` only (no `jd_id`), so the UI can only show the error. Rare; the inline duplicate check carries `jd_id`.
- History fetches **every** JD (up to 500, full `jd_object`) just to preview a job on click. Fine now; if it grows, fetch `GET /v1/job-descriptions/{id}` on demand instead. `X-Total-Count` is read by the client but not used for pagination yet.
- Pre-existing hydration warning on `/dashboard/history?tab=screener` (`TopNav > Sheet`, a Radix id mismatch from `useSearchParams`); the UI still works. Not caused by this phase; Phase 6 may fix it when it reworks the shell.
- A user's first request creates their credit account, so two parallel first requests race on `INSERT ... ON CONFLICT DO NOTHING`: fine (tested live, the dashboard fires 6 at once).
- Phase 8: run the Better Auth migration (creates `jwks`) on production; set `NEXT_PUBLIC_API_URL` as **build-time**, `API_INTERNAL_URL` + `INTERNAL_API_KEY` runtime; `BETTER_AUTH_URL` must equal the backend's `AUTH_ISSUER`; rotate and re-set `N8N_API_KEY` after the n8n key rotation.

### Next session starting point
- Phase 5 (design system + marketing). First: read the "Temporary UI" list above, then start the stack as described (`npm run dev` + the backend) so you can see real screens while designing. Phase 5 only needs the marketing/auth routes; the dashboard keeps working on the new data layer meanwhile.
- Must not break: `src/lib/api/*` contracts (`ApiError`, `waitForJob`, `describeError`), the `jwt()` payload keeping `email`, `deleteUser.beforeDelete` aborting on any backend failure, `NEXT_PUBLIC_API_URL` being build-time, nothing in `src/` referencing n8n except the contact route, no Clerk / `middleware.ts` / Vercel Analytics, and nothing run against the production DB before phase 8.
