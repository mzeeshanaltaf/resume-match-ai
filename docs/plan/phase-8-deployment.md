# Phase 8: Deployment (Coolify) and cutover

Branch: merge phases 1-7 to `main` at the end of this phase only. Master plan section: Part 5.

**This phase touches production and the shared VPS (18+ apps). Confirm with the user before each outward-facing or hard-to-reverse step** (DNS change, production DB migration which truncates tables, pushing to `main`, deactivating n8n workflows).

## Read first
`README.md`, `master-plan.md`, `handoff.md` (especially the final env var list from Phase 7), `CLAUDE.md` deployment section, and the `add-app-to-coolify` and `add-minio-storage-to-coolify` skills. Coolify root token: `COOLIFY_API_TOKEN_ROOT` (see `.env.local`/environment; never print it). SSH: `ssh -i ~/.ssh/hostinger_vps_ed25519 root@76.13.7.106`, Coolify API at `http://localhost:8000/api/v1`.

## Tasks
0. Pre-flight: user has rotated the n8n API key and updated `N8N_API_KEY` in Coolify. Check VPS disk (`df -h /`) and the weekly docker cleanup per global CLAUDE.md before a heavy build.
1. MinIO: check for an existing MinIO service on this Coolify instance; reuse with a new private bucket `resumatch` and scoped credentials, else deploy one with no public domain on the shared Docker network.
2. DNS: `A api.resumatch` -> `76.13.7.106` (Hostinger DNS).
3. Coolify backend app in project ResuMatchAI: same repo, base dir `/backend`, Dockerfile build, port 8000, domain `https://api.resumatch.zeeshanai.cloud`, health check `/health`, runtime env per the master plan (`DATABASE_URL` host `10.0.0.1`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `AUTH_JWKS_URL`, `AUTH_ISSUER`, `CORS_ORIGINS`, `INTERNAL_API_KEY`, `STORAGE_BACKEND=s3`, `S3_*`, plus tuned model/limit settings).
4. Production migrations: Alembic (after backing up the app tables if the user wants), then the Better Auth `jwks` migration.
5. Frontend app env: `NEXT_PUBLIC_API_URL` (build-time), `API_INTERNAL_URL` and `INTERNAL_API_KEY` (runtime), remove unused `N8N_*`.
6. `.github/workflows/deploy.yml` deploys both apps; add secret `COOLIFY_BACKEND_APP_UUID`.
7. Merge to `main`, push, watch both deploys.
8. After a verified live match, deactivate the five n8n workflows (the contact workflow stays).
9. Update `CLAUDE.md`, `README.md`, and the memory index (new architecture, UUIDs, env, deployment) so future sessions are accurate.

## Exit criteria
- `https://api.resumatch.zeeshanai.cloud/health` 200; `/api/auth/ok` 200; `/api/auth/jwks` serves keys.
- One full match on the live site; credit ledger correct; Coolify logs clean for both apps.
- MinIO: object exists after upload, row has no binary, preview works, delete removes the object, bucket not reachable without credentials.
- Account deletion works on a throwaway live account.
- n8n workflows deactivated (except contact); docs updated.

## Handoff notes to record
New Coolify app UUID, MinIO details (non-secret), DNS record, anything left for the "Recommended later" list.
