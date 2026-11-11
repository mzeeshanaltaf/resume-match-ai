# Phase 2: Backend documents pipeline (resumes and job descriptions)

Branch: `phase-2-backend-documents`. Master plan sections: Part 1 (scanned PDFs, validation gate, upload limits, endpoints for resumes/JDs/jobs, object storage), "n8n behaviors deliberately changed".

## Read first
`README.md`, `master-plan.md`, `handoff.md` (especially Phase 1's section for table names and local run commands), `CLAUDE.md`. Re-read the n8n workflow `ResuMatchAI.json` for the resume-processing, JD-extraction and matching prompts and the dedup hash inputs; port them faithfully.

## Goal
Upload a resume or submit a JD and get a validated, stored, deduplicated record, with live progress events. Matching is Phase 3.

## Tasks
1. `services/llm.py`: single OpenAI wrapper (Responses API, structured outputs from Pydantic models). Model, service tier, reasoning effort, timeout all from settings; one retry on `LLM_FALLBACK_SERVICE_TIER` on flex timeout/capacity error. Check the current OpenAI SDK/docs for exact parameters rather than assuming (the `gpt-6-luna` model, `flex` tier and Decisions API are named in the plan).
2. `services/prompts.py`: ported JD-extraction prompt, candidate/recruiter match prompts (used in Phase 3), OCR transcribe-only prompt, plus placeholders for the two new prompts.
3. `services/extraction.py`: PDF text via PyMuPDF, DOCX via python-docx, TXT; page, word, char counts; magic-byte type detection; vision OCR fallback when PDF text < 20 chars (render pages with PyMuPDF, send as images, set `is_scanned`).
4. `services/validation.py`: Decisions API gate with the `predicate` + `choice` questions, `DECISION_MIN_PROBABILITY`, refusal = rejection, specific rejection messages. Resume -> `422 INVALID_RESUME`, JD -> `422 INVALID_JD`.
5. `services/scraping.py`: Firecrawl scrape, bounded polling, failure handling, truncation to `MAX_JD_CHARS`.
6. `services/jobs.py`: in-process asyncio job runner, `jobs` table state, step events, SSE-ready event stream; on startup mark leftover `running` jobs failed (and refund hook for Phase 3).
7. Routers: `POST/GET /v1/resumes`, `GET /v1/resumes/{id}/file`, `DELETE /v1/resumes/{id}`; `POST/GET /v1/job-descriptions`, `GET/DELETE /v1/job-descriptions/{id}`; `GET /v1/jobs/{id}`, `GET /v1/jobs/{id}/events`. Enforce the layered limits in order (size streamed cut-off, magic bytes, pages, chars, per-user cap) and the order of operations in the plan. Deletes remove the row then the object.
8. Tests with OpenAI/Firecrawl mocked: every upload limit including an oversized streamed body cut off without buffering, ownership isolation between two users, dedup per `(user_id, checksum)`, invalid doc rejected and not stored, scanned-PDF path completes, decision threshold, job lifecycle, settings drive model and tier.

## Exit criteria
- `uv run pytest` passes (new and Phase 1 tests).
- Manual smoke with a dev JWT: upload a text PDF, DOCX and TXT; both limit violations (6-page PDF, >5 MB) are refused with the documented codes; JD by text and by URL (mocked or real key) creates a record; SSE stream shows real steps.
- Real OpenAI calls are NOT required to pass tests, but note in handoff whether live calls were tried.

## Handoff notes to record
Actual Decisions API request/response shape used; any OpenAI SDK version quirks; SSE event format (the frontend client in Phase 4 depends on it); error codes added.
