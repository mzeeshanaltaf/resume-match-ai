# Phase 3: Backend matching, generation, credits API, export and account erase

Branch: `phase-3-backend-matching`. Master plan sections: Part 1 (matches/screenings/generated docs/overview/credits/export/internal erase endpoints, credits, account deletion, data export).

## Read first
`README.md`, `master-plan.md`, `handoff.md` (Phases 1 and 2: table names, job/SSE format, llm wrapper API), `CLAUDE.md`.

## Goal
Complete the API surface so the frontend only needs wiring.

## Tasks
1. `POST /v1/matches`: verify resume and JD exist, are owned by caller and valid; reserve 1 credit (402 `INSUFFICIENT_CREDITS` if none); start job; candidate vs recruiter prompt by mode; store result in the existing match report shape; refund on failure.
2. `POST /v1/screenings`: batch job, 1 credit per resume, per-resume progress events, ranked result, failed items refunded; cap `MAX_SCREENING_RESUMES`.
3. `GET /v1/matches` (ordered, paginated), `GET /v1/matches/{id}`, `DELETE /v1/matches/{id}` which deletes **only** the match.
4. `POST /v1/matches/{id}/tailored-bullets` (included in match credit) and `POST /v1/matches/{id}/cover-letter` (1 credit); store in `generated_documents`; new prompts in `prompts.py`.
5. `GET /v1/overview`, `GET /v1/credits`, `GET /v1/credits/transactions` (ordered, no hidden caps, empty list is `[]`).
6. `services/account.py` + `GET /v1/account/export`: ZIP built into a temp file and streamed, contents per master plan, one export per hour per user (429 with clear code).
7. `DELETE /internal/users/{id}`: `X-Internal-Key` only (constant-time compare), erases all app data in one transaction then deletes MinIO/local objects under the user's prefix, writes the `deleted_accounts` salted email hash (the endpoint therefore needs the email in the request body or a lookup; decide, document in handoff, and make the Better Auth `beforeDelete` hook in Phase 4 send it).
8. Startup recovery: leftover `running` jobs marked failed and refunded.
9. Tests: credit reserve/refund under concurrency across matches and screenings, 402 path, delete-match keeps resume and JD, ownership isolation on every new endpoint, export ZIP contents, export rate limit, internal endpoint rejects JWT and wrong key, full erase leaves zero rows and no objects, re-register-with-same-email yields 0 credits.

## Exit criteria
- `uv run pytest` passes with all phases' tests.
- OpenAPI doc (`/docs`) lists every endpoint in the master plan table; save a snapshot to `backend/openapi.json` so Phase 4 can generate/hand-write types from it.
- Manual smoke: full flow with mocked LLM through a dev JWT.

## Handoff notes to record
Final request/response shapes (point to `backend/openapi.json`), the internal erase request contract, SSE event names, all error codes. This is what Phase 4 consumes.
