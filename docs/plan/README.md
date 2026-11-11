# ResuMatchAI rebuild: phased plan and session handoff

Source of truth for all decisions: [master-plan.md](master-plan.md) (verbatim copy of the approved plan). Each phase file below is a slice of it, sized for one Claude Code session.

## Phases

| # | File | Outcome |
|---|---|---|
| 1 | [phase-1-backend-foundation-database.md](phase-1-backend-foundation-database.md) | `backend/` scaffold, config, auth, DB models + Alembic migration, storage, credits |
| 2 | [phase-2-backend-documents-pipeline.md](phase-2-backend-documents-pipeline.md) | Extraction, OCR, validation gate, scraping, LLM wrapper, jobs runner, resume + JD endpoints |
| 3 | [phase-3-backend-matching-account.md](phase-3-backend-matching-account.md) | Matches, screenings, tailored bullets, cover letter, overview, credits API, export, account erase |
| 4 | [phase-4-frontend-data-layer.md](phase-4-frontend-data-layer.md) | Better Auth JWT, typed API client, n8n code removed, dashboard wired to FastAPI |
| 5 | [phase-5-design-system-marketing.md](phase-5-design-system-marketing.md) | PRODUCT.md, DESIGN.md, tokens, fonts, landing + all marketing/auth screens |
| 6 | [phase-6-dashboard-redesign.md](phase-6-dashboard-redesign.md) | Dashboard shell, flows, report page, screener, settings account tab |
| 7 | [phase-7-local-e2e-verification.md](phase-7-local-e2e-verification.md) | Live validation-gate tuning, full local run, design QA |
| 8 | [phase-8-deployment.md](phase-8-deployment.md) | MinIO, DNS, Coolify backend app, migrations, workflow, cutover |

Dependencies are strictly sequential (1 → 8). Phases 5 and 6 only need Phase 4 done and could be reordered with Phase 4 if desired, but keep the numbering for handoff clarity.

## Handoff protocol (applies to every session)

**Why this exists:** a new session starts with zero memory of earlier ones. Context lives in three places: the repo (code), [master-plan.md](master-plan.md) (decisions), and [handoff.md](handoff.md) (what actually happened, deviations, open items). Keep all three honest.

### Starting a session for phase N

Paste this prompt, replacing N:

```
Implement phase N of the ResuMatchAI rebuild.
1. Read docs/plan/README.md, docs/plan/master-plan.md, docs/plan/handoff.md, and docs/plan/phase-N-*.md in full.
2. Read the project CLAUDE.md and the memory index.
3. Check `git status` and `git log -5` and confirm the previous phase's "Exit criteria" are actually met (run its verification commands). Report any gap before starting.
4. Implement only phase N. Where the code contradicts the plan, follow the code's reality and record the deviation in handoff.md.
```

### Finishing a session for phase N (mandatory, in this order)

1. Run the phase's **Exit criteria** commands; fix or record failures.
2. Append a section to [handoff.md](handoff.md) using the template there: what was built, files created/changed, deviations from the plan, env vars/commands introduced, open issues, and exact next-session starting point.
3. If the phase changed anything the project docs describe (commands, env vars, architecture), update `CLAUDE.md` in the same session. Phase 4 and 8 do the large rewrite; earlier phases add a short "backend/" note.
4. Commit the work on a branch (`phase-N-<slug>`), without pushing to `main` before Phase 8 (a push to `main` triggers a production deploy). Mark the phase `Done` in the status table of [handoff.md](handoff.md).
5. End the session. Do not start the next phase in the same session.

### Rules that hold across all phases

- Never push to `main` before Phase 8; work on `phase-N-*` branches and merge locally in order (or stack them).
- Secrets stay in `.env.local` / Coolify. Never print or commit keys. The n8n key committed in workflow `pinData` is a known leak (rotation is a user prerequisite, see master plan).
- Use the Write/Edit tools for file content, not shell heredocs (user's global rule).
- Dev server URL is `http://127.0.0.1:3000`, not `localhost`.
- Don't reintroduce Clerk, Vercel Analytics, or `middleware.ts`. Keep the contact form (honeypot + native POST fallback) intact.
- Next.js 16 here: check `node_modules/next/dist/docs/` before using unfamiliar APIs.
