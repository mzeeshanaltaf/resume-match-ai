# Phase 1: Backend foundation and database

Branch: `phase-1-backend-foundation`. Master plan sections: Part 1 (stack, layout, auth, model configuration, storage, credits), Part 2 (database).

## Read first
`README.md` (handoff protocol), `master-plan.md`, `handoff.md`, project `CLAUDE.md`. Look at the existing n8n workflows in `n8n_workflows/` and the Postgres `resume_match` schema (via `DATABASE_URL` in `.env.local`) to learn the current table shapes before writing models.

## Goal
A running FastAPI service skeleton with auth, config, database layer, object storage, and credits, plus the Alembic migration that reshapes the `resume_match` schema. No AI or business endpoints yet.

## Tasks
1. Confirm `uv` is installed (install if missing). Create `backend/` with `pyproject.toml` (Python 3.12; FastAPI, uvicorn, SQLAlchemy 2 async, asyncpg, Alembic, pydantic-settings, aioboto3, openai, httpx, PyMuPDF, python-docx, PyJWT[crypto], python-multipart, pytest, pytest-asyncio, httpx), `Dockerfile` (uv-based, port 8000), `.env.example`, `.gitignore` entries.
2. `app/config.py`: all settings from the master plan tables (model, tier, fallback tier, reasoning effort + per-task overrides, timeouts, decision model/threshold, every upload limit, storage, auth, CORS, internal key). Nothing hardcoded elsewhere.
3. `app/db.py`: async engine with `search_path=resume_match`; session dependency.
4. `app/models.py`: SQLAlchemy models for the existing tables (`user_resume`, `user_jds`, `job_match_summary`, credit account + transactions) in their target shape, plus new `deleted_accounts`, `jobs`, `generated_documents`. Inspect the live schema first for exact existing table and column names and keep them.
5. Alembic (`alembic.ini`, version table inside `resume_match`): one migration per Part 2 (truncate dummy data, `(user_id, checksum)` uniqueness, drop `file_binary_data`, add `storage_key NOT NULL`, FKs with `ON DELETE CASCADE`, `(user_id, created_at)` index, extended transaction-type CHECK, new tables). Do NOT touch Better Auth tables. Run it against a **local/dev** database only; confirm with the user before running anything against the shared production DB, since the migration truncates tables.
6. `app/auth.py`: JWT verification against JWKS (cached, EdDSA), check `iss`/`aud`/`exp`, `current_user` dependency returning `sub`. Allow tests to inject a fake key set.
7. `app/services/storage.py`: `put / get_stream / delete / delete_prefix` with `local` and `s3` backends chosen by `STORAGE_BACKEND`. Startup sweep for orphaned keys (stub acceptable if resumes router lands in phase 2, but the function must exist).
8. `app/services/credits.py`: lazy account creation with 10-credit grant (`INSERT ... ON CONFLICT DO NOTHING`), atomic reserve and refund each writing a transaction row in one statement, and the `deleted_accounts` email-hash check (salted) so re-registered emails start at 0.
9. `app/main.py`: app factory, CORS (frontend origin only), `/health`, uniform error shape `{code, message, details}` with exception handlers.
10. Tests (`backend/tests/`): auth rejection (missing/expired/wrong issuer), settings override behavior, storage local backend round trip, credits reserve/refund including concurrent reservations never overdrawing, error shape.

## Exit criteria
- `cd backend && uv run pytest` passes.
- `uv run uvicorn app.main:app` starts; `GET /health` returns 200; an authenticated test call to a stub protected route works with a test JWT and fails without one.
- `alembic upgrade head` succeeds on a dev DB and `alembic downgrade`/re-upgrade does not error; schema matches Part 2.
- No secrets committed; `.env.example` lists every backend env var.

## Handoff notes to record
Exact table/column names found in the live schema; how the dev DB was provisioned; any difference between n8n's table shapes and the plan; how to run backend and tests locally.
