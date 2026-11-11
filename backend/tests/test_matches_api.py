"""POST/GET/DELETE /v1/matches: credits, prompts by mode, refunds, ownership, delete semantics."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.errors import AppError
from app.models import GeneratedDocument, Job, JobMatchSummary
from app.schemas import CandidateMatchReport, RecruiterMatchReport
from app.services import prompts
from app.services.runner import build_runner
from tests.conftest import Pipeline
from tests.fakes import candidate_report, make_pdf, unique_resume_text


# ── Happy paths ─────────────────────────────────────────────────────────────


async def test_candidate_match_stores_the_full_report_and_costs_one_credit(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    assert await pipeline.balance() == 10  # uploads and JD processing are free

    result = await pipeline.match_ok(resume["id"], jd["id"])
    match = result["match"]
    assert result["match_id"] == match["id"]
    assert match["mode"] == "candidate"
    assert match["resume_id"] == resume["id"] and match["jd_id"] == jd["id"]
    assert match["overall_score_percent"] == 82
    assert match["job_title"] == "Senior Backend Engineer" and match["company_name"] == "Acme Corp"
    assert set(match["report"]) == {"match_summary", "detailed_analysis", "improvement_suggestions", "ats_optimization"}
    assert match["report"]["match_summary"]["key_strengths"][0]["strength"] == "Python"

    assert await pipeline.balance() == 9
    ledger = await pipeline.transactions()
    spend = [t for t in ledger if t["transaction_type"] == "match_analysis"]
    assert len(spend) == 1 and spend[0]["credits_delta"] == -1
    assert spend[0]["reference_id"] == match["id"]  # the ledger points at what it paid for


async def test_candidate_mode_uses_the_candidate_prompt_and_schema(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair(mode="candidate")
    await pipeline.match_ok(resume["id"], jd["id"])
    call = [c for c in pipeline.llm.parse_calls if c["task"] == "match"][0]
    assert call["instructions"] == prompts.CANDIDATE_MATCH_INSTRUCTIONS
    assert call["schema"] is CandidateMatchReport
    assert "[RESUME]" in call["input"] and "Jane Candidate" in call["input"]
    assert "Job Title: Senior Backend Engineer" in call["input"]  # the n8n "Data" node text


async def test_recruiter_mode_uses_the_recruiter_prompt_and_stores_the_short_report(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair(mode="recruiter")
    match = (await pipeline.match_ok(resume["id"], jd["id"]))["match"]
    call = [c for c in pipeline.llm.parse_calls if c["task"] == "match"][0]
    assert call["instructions"] == prompts.RECRUITER_MATCH_INSTRUCTIONS
    assert call["schema"] is RecruiterMatchReport
    assert match["mode"] == "recruiter"
    assert set(match["report"]) == {"match_summary"}
    assert match["report"]["match_summary"]["rationale"]


async def test_out_of_range_scores_are_clamped(pipeline: Pipeline) -> None:
    pipeline.llm.match_score = 140
    resume, jd = await pipeline.pair()
    assert (await pipeline.match_ok(resume["id"], jd["id"]))["match"]["overall_score_percent"] == 100


async def test_job_reports_analyzing_then_saving_steps(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    job = await pipeline.finish(await pipeline.post_match(resume["id"], jd["id"]))
    assert [(s["name"], s["status"]) for s in job["steps"]] == [("analyzing", "done"), ("saving", "done")]
    assert job["kind"] == "match"


# ── Credits ─────────────────────────────────────────────────────────────────


async def test_no_credits_is_402_and_nothing_runs(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=0)
    resume, jd = await pipeline.pair()
    response = await pipeline.post_match(resume["id"], jd["id"])
    assert response.status_code == 402
    body = response.json()
    assert body["code"] == "INSUFFICIENT_CREDITS"
    assert body["details"] == {"needed": 1, "balance": 0}
    assert [c for c in pipeline.llm.parse_calls if c["task"] == "match"] == []
    assert await pipeline.balance() == 0
    assert (await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json() == []


async def test_failed_analysis_refunds_the_credit(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    pipeline.llm.error = AppError(504, "LLM_TIMEOUT", "slow")
    job = await pipeline.finish(await pipeline.post_match(resume["id"], jd["id"]))
    assert job["status"] == "failed" and job["error"]["code"] == "LLM_TIMEOUT"
    assert await pipeline.balance() == 10

    ledger = await pipeline.transactions()
    kinds = sorted((t["transaction_type"], t["credits_delta"]) for t in ledger if t["transaction_type"] != "signup_bonus")
    assert kinds == [("match_analysis", -1), ("refund", 1)]
    assert len({t["reference_id"] for t in ledger if t["reference_id"]}) == 1  # both name the same match
    assert (await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json() == []


async def test_concurrent_matches_never_overspend(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=3)
    resume, jd = await pipeline.pair()

    responses = await asyncio.gather(*(pipeline.post_match(resume["id"], jd["id"]) for _ in range(8)))
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [202] * 3 + [402] * 5
    await pipeline.runner.wait_idle()

    assert await pipeline.balance() == 0
    ledger = await pipeline.transactions()
    assert sorted(t["credits_delta"] for t in ledger) == [-1, -1, -1, 3]  # bonus + exactly 3 charges
    listing = await pipeline.client.get("/v1/matches", headers=pipeline.headers())
    assert len(listing.json()) == 3


async def test_concurrent_failures_refund_exactly_once_each(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=4)
    resume, jd = await pipeline.pair()
    pipeline.llm.error = AppError(502, "LLM_UNAVAILABLE", "down")

    responses = await asyncio.gather(*(pipeline.post_match(resume["id"], jd["id"]) for _ in range(4)))
    assert [r.status_code for r in responses] == [202] * 4
    await pipeline.runner.wait_idle()

    assert await pipeline.balance() == 4
    ledger = await pipeline.transactions()
    assert sum(t["credits_delta"] for t in ledger) == 4
    assert sum(1 for t in ledger if t["transaction_type"] == "refund") == 4


async def test_resume_deleted_mid_analysis_refunds(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    release = asyncio.Event()
    started = asyncio.Event()

    async def hold(task: str, schema: type, input: Any) -> None:
        started.set()
        await release.wait()

    pipeline.llm.parse_hook = hold
    response = await pipeline.post_match(resume["id"], jd["id"])
    await started.wait()
    assert (await pipeline.client.delete(f"/v1/resumes/{resume['id']}", headers=pipeline.headers())).status_code == 204
    release.set()

    job = await pipeline.finish(response)
    assert job["status"] == "failed" and job["error"]["code"] == "SOURCE_DELETED"
    assert await pipeline.balance() == 10


# ── Input checks ────────────────────────────────────────────────────────────


async def test_unknown_resume_or_jd_is_404_without_charging(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    for resume_id, jd_id in ((str(uuid.uuid4()), jd["id"]), (resume["id"], str(uuid.uuid4()))):
        response = await pipeline.post_match(resume_id, jd_id)
        assert response.status_code == 404 and response.json()["code"] == "NOT_FOUND"
    assert await pipeline.balance() == 10


async def test_mismatched_modes_are_rejected(pipeline: Pipeline) -> None:
    resume = await pipeline.upload_ok(make_pdf(text=unique_resume_text(1)), "cand.pdf", mode="candidate")
    jd = await pipeline.jd_ok(mode="recruiter")
    response = await pipeline.post_match(resume["id"], jd["id"])
    assert response.status_code == 422 and response.json()["code"] == "MODE_MISMATCH"
    assert response.json()["details"]["resume_mode"] == "candidate"
    assert await pipeline.balance() == 10


async def test_invalid_body_is_422(pipeline: Pipeline) -> None:
    for body in ({}, {"resume_id": "nope", "jd_id": "nope"}, {"resume_id": str(uuid.uuid4())}):
        response = await pipeline.client.post("/v1/matches", json=body, headers=pipeline.headers())
        assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"


# ── Ownership isolation ─────────────────────────────────────────────────────


async def test_other_users_documents_cannot_be_matched(pipeline: Pipeline) -> None:
    resume_a, jd_a = await pipeline.pair("user-a")
    resume_b, jd_b = await pipeline.pair("user-b", n=1)
    for resume_id, jd_id in ((resume_a["id"], jd_b["id"]), (resume_b["id"], jd_a["id"])):
        response = await pipeline.post_match(resume_id, jd_id, "user-a" if resume_id == resume_a["id"] else "user-b")
        assert response.status_code == 404 and response.json()["code"] == "NOT_FOUND"
    assert await pipeline.balance("user-a") == 10


async def test_match_read_list_and_delete_are_isolated(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair("user-a")
    match_id = (await pipeline.match_ok(resume["id"], jd["id"], "user-a"))["match_id"]
    other = pipeline.headers("user-b")

    assert (await pipeline.client.get(f"/v1/matches/{match_id}", headers=other)).status_code == 404
    assert (await pipeline.client.delete(f"/v1/matches/{match_id}", headers=other)).status_code == 404
    assert (await pipeline.client.get("/v1/matches", headers=other)).json() == []
    # ...and user-a's match is untouched by the attempts.
    assert (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers("user-a"))).status_code == 200


async def test_matches_need_a_token(pipeline: Pipeline) -> None:
    for method, url in (
        ("POST", "/v1/matches"),
        ("GET", "/v1/matches"),
        ("GET", f"/v1/matches/{uuid.uuid4()}"),
        ("DELETE", f"/v1/matches/{uuid.uuid4()}"),
    ):
        response = await pipeline.client.request(method, url)
        assert response.status_code == 401, (method, url)


# ── History: ordering, pagination, detail ───────────────────────────────────


async def test_history_is_newest_first_paginated_and_empty_is_a_list(pipeline: Pipeline) -> None:
    assert (await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json() == []

    resume, jd = await pipeline.pair()
    ids = []
    for score in (60, 70, 80):
        pipeline.llm.match_score = score
        ids.append((await pipeline.match_ok(resume["id"], jd["id"]))["match_id"])

    page = await pipeline.client.get("/v1/matches", headers=pipeline.headers())
    assert [m["id"] for m in page.json()] == ids[::-1]  # newest first, every row (no hidden cap)
    assert page.headers["x-total-count"] == "3"
    assert page.json()[0]["resume_file_name"] == "resume-0.pdf"
    assert "report" not in page.json()[0]  # the list is light; GET /matches/{id} has the report

    first = await pipeline.client.get("/v1/matches?limit=2", headers=pipeline.headers())
    second = await pipeline.client.get("/v1/matches?limit=2&offset=2", headers=pipeline.headers())
    assert [m["id"] for m in first.json()] == ids[::-1][:2]
    assert [m["id"] for m in second.json()] == ids[::-1][2:]
    assert first.headers["x-total-count"] == "3"
    assert (await pipeline.client.get("/v1/matches?limit=0", headers=pipeline.headers())).status_code == 422


async def test_get_match_returns_the_report_and_documents(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    match_id = (await pipeline.match_ok(resume["id"], jd["id"]))["match_id"]
    response = await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())
    body = response.json()
    assert response.status_code == 200
    assert body["id"] == match_id and body["documents"] == []
    assert body["report"]["match_summary"]["overall_score_percent"] == 82
    assert body["jd_url"] is None and body["resume_file_name"] == "resume-0.pdf"


# ── Delete only the match ───────────────────────────────────────────────────


async def test_delete_match_keeps_resume_and_jd_and_removes_its_documents(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    resume, jd = await pipeline.pair()
    match_id = (await pipeline.match_ok(resume["id"], jd["id"]))["match_id"]
    await pipeline.finish(
        await pipeline.client.post(f"/v1/matches/{match_id}/tailored-bullets", headers=pipeline.headers())
    )

    response = await pipeline.client.delete(f"/v1/matches/{match_id}", headers=pipeline.headers())
    assert response.status_code == 204

    assert (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())).status_code == 404
    resumes = (await pipeline.client.get("/v1/resumes", headers=pipeline.headers())).json()
    jds = (await pipeline.client.get("/v1/job-descriptions", headers=pipeline.headers())).json()
    assert [r["id"] for r in resumes] == [resume["id"]]
    assert [j["id"] for j in jds] == [jd["id"]]
    assert (await pipeline.client.get(f"/v1/resumes/{resume['id']}/file", headers=pipeline.headers())).status_code == 200
    async with sessionmaker() as session:
        assert (await session.scalars(select(GeneratedDocument))).all() == []
    # Deleting it again is a clean 404, and it does not refund (the analysis was delivered).
    assert (await pipeline.client.delete(f"/v1/matches/{match_id}", headers=pipeline.headers())).status_code == 404
    assert await pipeline.balance() == 9


# ── Recovery of interrupted jobs ────────────────────────────────────────────


async def test_startup_recovery_refunds_a_match_job_the_process_never_finished(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    resume, jd = await pipeline.pair()
    started = asyncio.Event()

    async def hold_forever(task: str, schema: type, input: Any) -> None:
        started.set()
        await asyncio.Event().wait()

    pipeline.llm.parse_hook = hold_forever
    response = await pipeline.post_match(resume["id"], jd["id"])
    await started.wait()
    job_id = response.json()["job_id"]
    assert await pipeline.balance() == 9  # reserved while it "runs"

    # Simulate a crash: a fresh process starts with the row still `running` and no task.
    fresh = build_runner(lambda: sessionmaker, pipeline.settings)
    assert await fresh.recover_interrupted() == 1

    async with sessionmaker() as session:
        job = (await session.scalars(select(Job).where(Job.id == uuid.UUID(job_id)))).one()
    assert job.status == "failed" and job.error["code"] == "JOB_INTERRUPTED"
    assert await pipeline.balance() == 10
    assert await fresh.recover_interrupted() == 0  # nothing left; no double refund
    assert await pipeline.balance() == 10

    await pipeline.runner.shutdown()  # unblock the original task; its own hook must not refund again
    assert await pipeline.balance() == 10


async def test_refund_is_skipped_when_the_match_was_already_saved(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    """A job that died after saving its result must not refund a delivered analysis."""
    resume, jd = await pipeline.pair()
    result = await pipeline.match_ok(resume["id"], jd["id"])
    async with sessionmaker() as session:
        job = (await session.scalars(select(Job).where(Job.kind == "match"))).one()
        job.status = "running"  # pretend the final status write was lost
        await session.commit()
    fresh = build_runner(lambda: sessionmaker, pipeline.settings)
    assert await fresh.recover_interrupted() == 1
    assert await pipeline.balance() == 9
    async with sessionmaker() as session:
        assert await session.get(JobMatchSummary, uuid.UUID(result["match_id"])) is not None


async def test_pool_of_users_is_isolated_in_the_ledger(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair("user-a")
    await pipeline.match_ok(resume["id"], jd["id"], "user-a")
    assert await pipeline.balance("user-a") == 9
    assert await pipeline.balance("user-b") == 10
    assert [t["transaction_type"] for t in await pipeline.transactions("user-b")] == ["signup_bonus"]


async def test_candidate_report_helper_roundtrips() -> None:
    assert CandidateMatchReport.model_validate(candidate_report(55).model_dump()).match_summary.overall_score_percent == 55


async def test_app_startup_refunds_interrupted_credit_jobs_of_every_kind(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    """Plan task 8, through the real lifespan: leftover `running` jobs are failed and refunded."""
    from app.services import credits, reservations

    resume, jd = await pipeline.pair()
    match_id = (await pipeline.match_ok(resume["id"], jd["id"]))["match_id"]
    assert await pipeline.balance() == 9

    async with sessionmaker() as session:
        for kind, reference_kind, transaction_type in (
            ("match", reservations.MATCH, "match_analysis"),
            ("cover_letter", reservations.DOCUMENT, "cover_letter"),
            ("screening", reservations.MATCH, "screening"),
        ):
            reference = uuid.uuid4()  # something bought but never delivered
            await credits.reserve(session, "user-1", 1, transaction_type, reference_id=reference)
            session.add(
                Job(
                    user_id="user-1",
                    kind=kind,
                    status="running",
                    steps=[{"name": "x", "status": "running"}],
                    meta=reservations.meta_for([reservations.entry(reference, 1, reference_kind)]),
                )
            )
        await session.commit()
    assert await pipeline.balance() == 6

    async with pipeline.app.router.lifespan_context(pipeline.app):
        pass
    assert await pipeline.balance() == 9  # the three undelivered reservations came back
    async with sessionmaker() as session:
        statuses = (await session.scalars(select(Job.status).where(Job.kind.in_(("match", "cover_letter", "screening"))))).all()
    assert set(statuses) == {"failed", "succeeded"} and statuses.count("failed") == 3
    assert (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())).status_code == 200
