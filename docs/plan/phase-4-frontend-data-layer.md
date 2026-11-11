# Phase 4: Frontend data layer (Better Auth JWT, API client, n8n removal)

Branch: `phase-4-frontend-data-layer`. Master plan sections: Part 3, plus the account-deletion flow in Part 1.

## Read first
`README.md`, `master-plan.md`, `handoff.md` (Phase 3: `backend/openapi.json`, SSE format, internal erase contract), `CLAUDE.md`, and the Better Auth docs for the `jwt` plugin and `user.deleteUser` (use the `better-auth-best-practices` skill; verify option names against the installed version rather than trusting the plan).

## Goal
The existing UI keeps its current look but runs entirely on FastAPI. No visual redesign yet.

## Tasks
1. `src/lib/auth.ts`: add `jwt()` plugin (issuer/audience = `BETTER_AUTH_URL`, EdDSA); remove the `signupCredits` `user.create.after` hook; enable `user.deleteUser` with `beforeDelete` calling `DELETE {API_INTERNAL_URL}/internal/users/{id}` with `X-Internal-Key` and the email per the Phase 3 contract; throw if the call fails. `src/lib/auth-client.ts`: add `jwtClient()`.
2. Run `npx @better-auth/cli@latest migrate` against the **dev** DB to create `jwks`. Do not run against production until Phase 8.
3. `src/lib/api/client.ts`: typed fetch wrapper to `NEXT_PUBLIC_API_URL`, cached JWT refreshed before expiry, parses `{code, message, details}`, fetch-based SSE reader for `/v1/jobs/{id}/events`. `src/lib/api/types.ts` replaces `src/types/n8n.ts` (keep match report types as they are).
4. Delete `src/lib/n8n.ts`, `n8n-main.ts`, `n8n-analytics.ts`, `n8n-credits.ts`, `n8n-data.ts`, `n8n-delete.ts`, `refresh-credits.ts`, and API routes `resume/*`, `jd/*`, `match/*`, `analytics`, `credits/*`, `user-data`. Keep `api/auth/*` and `api/contact`.
5. Rewire `src/contexts/dashboard-data.tsx` and every consumer (overview, history, match stepper, screen stepper, resume upload, credits display, PDF preview loading `/v1/resumes/{id}/file` on demand) to the new client. Replace the fake-progress flows with job events where it is a drop-in; the full progress UI redesign is Phase 6.
6. Behavior changes the UI must now respect: match costs 1 credit, 402 handling, new error codes shown as specific messages, delete-match leaves resume/JD, resume picker lists existing resumes.
7. Env: add `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, `INTERNAL_API_KEY`; drop all `N8N_*` except `N8N_API_KEY`; update `.env.example`. Update `CLAUDE.md` (architecture, commands for running backend + frontend together, env) and `README.md`.
8. Remove now-dead code and imports; keep CORS in mind (backend `CORS_ORIGINS` must include `http://127.0.0.1:3000`).

## Exit criteria
- `npx tsc --noEmit` and `npm run build` pass.
- With `uvicorn` and `npm run dev` running, at `http://127.0.0.1:3000`: sign in, upload a resume, submit a JD, run a match, see it in history, delete the match, resume still listed, credits ledger correct. (Use mocked/real LLM per what is available; record which.)
- `grep -ri n8n src` shows only the contact route and its lib.

## Handoff notes to record
Which components still use temporary UI for progress (Phase 6 replaces), any API gaps found that need backend fixes, exact local run instructions.
