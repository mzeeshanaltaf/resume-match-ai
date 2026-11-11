# ResuMatchAI backend

FastAPI service that replaces the n8n workflows. Phase 1 contains the foundation only:
config, auth, database + Alembic, object storage, credits. No AI or business endpoints yet.

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

## Safety notes

- The backend reads `backend/.env` and the process environment only, **never** the repo-root
  `.env.local` (whose `DATABASE_URL` is the shared production database).
- Migration `0002` truncates the app tables. Do not run it against production until phase 8.
- Test fixtures `DROP SCHEMA resume_match CASCADE`; they refuse any database that is not local
  with "test" in its name (`TEST_DATABASE_URL`).
