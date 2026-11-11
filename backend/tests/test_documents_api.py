"""POST /v1/matches/{id}/tailored-bullets and /cover-letter."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from app.errors import AppError
from app.services import prompts
from tests.conftest import Pipeline


async def _candidate_match(pipeline: Pipeline, sub: str = "user-1") -> str:
    resume, jd = await pipeline.pair(sub)
    return (await pipeline.match_ok(resume["id"], jd["id"], sub))["match_id"]


async def _post(pipeline: Pipeline, match_id: str, what: str, sub: str = "user-1") -> Any:
    return await pipeline.client.post(f"/v1/matches/{match_id}/{what}", headers=pipeline.headers(sub))


# ── Tailored bullets ────────────────────────────────────────────────────────


async def test_tailored_bullets_are_free_stored_and_returned_with_the_match(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    balance = await pipeline.balance()

    job = await pipeline.finish(await _post(pipeline, match_id, "tailored-bullets"))
    assert job["status"] == "succeeded" and job["kind"] == "tailored_bullets"
    assert [(s["name"], s["status"]) for s in job["steps"]] == [("generating", "done"), ("saving", "done")]
    document = job["result"]["document"]
    assert document["kind"] == "tailored_bullets" and document["match_id"] == match_id
    assert document["content"]["summary"].startswith("Backend engineer")
    assert document["content"]["experience"][0]["bullets"][0]["rewritten"]

    assert await pipeline.balance() == balance  # included in the match credit

    call = [c for c in pipeline.llm.parse_calls if c["task"] == "bullets"][0]
    assert call["instructions"] == prompts.TAILORED_BULLETS_INSTRUCTIONS
    assert "[RESUME]" in call["input"] and "[JOB_DESCRIPTION]" in call["input"] and "[MATCH_ANALYSIS]" in call["input"]
    assert "Senior Backend Engineer" in call["input"] and "key_strengths" in call["input"]

    detail = (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())).json()
    assert [d["id"] for d in detail["documents"]] == [document["id"]]


async def test_bullets_can_only_be_generated_once_per_match(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    first = await pipeline.finish(await _post(pipeline, match_id, "tailored-bullets"))
    again = await _post(pipeline, match_id, "tailored-bullets")
    assert again.status_code == 409 and again.json()["code"] == "ALREADY_GENERATED"
    assert again.json()["details"] == {"document_id": first["result"]["document_id"]}
    assert len([c for c in pipeline.llm.parse_calls if c["task"] == "bullets"]) == 1


async def test_two_simultaneous_bullet_requests_store_only_one(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    first, second = await asyncio.gather(
        _post(pipeline, match_id, "tailored-bullets"), _post(pipeline, match_id, "tailored-bullets")
    )
    assert first.status_code in (202, 409) and second.status_code in (202, 409)
    await pipeline.runner.wait_idle()
    detail = (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())).json()
    assert [d["kind"] for d in detail["documents"]] == ["tailored_bullets"]


async def test_bullets_failure_does_not_touch_credits(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    pipeline.llm.error = AppError(504, "LLM_TIMEOUT", "slow")
    job = await pipeline.finish(await _post(pipeline, match_id, "tailored-bullets"))
    assert job["status"] == "failed" and job["error"]["code"] == "LLM_TIMEOUT"
    assert await pipeline.balance() == 9
    pipeline.llm.error = None  # and it can simply be retried
    retry = await pipeline.finish(await _post(pipeline, match_id, "tailored-bullets"))
    assert retry["status"] == "succeeded"


# ── Cover letter ────────────────────────────────────────────────────────────


async def test_cover_letter_costs_one_credit_and_is_stored(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    assert await pipeline.balance() == 9

    job = await pipeline.finish(await _post(pipeline, match_id, "cover-letter"))
    assert job["status"] == "succeeded" and job["kind"] == "cover_letter"
    document = job["result"]["document"]
    content = document["content"]
    assert document["kind"] == "cover_letter" and content["salutation"] == "Dear Acme hiring team,"
    assert content["text"].startswith("Dear Acme hiring team,\n\n") and content["text"].endswith("Jane Candidate")
    assert await pipeline.balance() == 8

    spend = [t for t in await pipeline.transactions() if t["transaction_type"] == "cover_letter"]
    assert len(spend) == 1 and spend[0]["credits_delta"] == -1
    assert spend[0]["reference_id"] == document["id"]
    call = [c for c in pipeline.llm.parse_calls if c["task"] == "cover_letter"][0]
    assert call["instructions"] == prompts.COVER_LETTER_INSTRUCTIONS


async def test_cover_letters_can_be_regenerated_each_costing_a_credit(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    for _ in range(2):
        assert (await pipeline.finish(await _post(pipeline, match_id, "cover-letter")))["status"] == "succeeded"
    assert await pipeline.balance() == 7
    detail = (await pipeline.client.get(f"/v1/matches/{match_id}", headers=pipeline.headers())).json()
    assert [d["kind"] for d in detail["documents"]] == ["cover_letter", "cover_letter"]


async def test_cover_letter_without_credits_is_402(make_pipeline: Any) -> None:
    pipeline = make_pipeline(signup_credits=1)
    match_id = await _candidate_match(pipeline)
    assert await pipeline.balance() == 0
    response = await _post(pipeline, match_id, "cover-letter")
    assert response.status_code == 402 and response.json()["code"] == "INSUFFICIENT_CREDITS"
    assert [c for c in pipeline.llm.parse_calls if c["task"] == "cover_letter"] == []


async def test_failed_cover_letter_is_refunded(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    pipeline.llm.error = AppError(502, "LLM_UNAVAILABLE", "down")
    job = await pipeline.finish(await _post(pipeline, match_id, "cover-letter"))
    assert job["status"] == "failed"
    assert await pipeline.balance() == 9
    ledger = await pipeline.transactions()
    assert sorted(
        (t["transaction_type"], t["credits_delta"])
        for t in ledger
        if t["transaction_type"] in ("refund", "cover_letter")
    ) == [("cover_letter", -1), ("refund", 1)]


async def test_match_deleted_while_the_letter_is_written_refunds(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline)
    started, release = asyncio.Event(), asyncio.Event()

    async def hold(task: str, schema: type, input: Any) -> None:
        started.set()
        await release.wait()

    pipeline.llm.parse_hook = hold
    response = await _post(pipeline, match_id, "cover-letter")
    await started.wait()
    assert (await pipeline.client.delete(f"/v1/matches/{match_id}", headers=pipeline.headers())).status_code == 204
    release.set()
    job = await pipeline.finish(response)
    assert job["status"] == "failed" and job["error"]["code"] == "SOURCE_DELETED"
    assert await pipeline.balance() == 9


# ── Shared rules ────────────────────────────────────────────────────────────


async def test_recruiter_matches_have_no_generated_documents(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair(mode="recruiter")
    match_id = (await pipeline.match_ok(resume["id"], jd["id"]))["match_id"]
    for what in ("tailored-bullets", "cover-letter"):
        response = await _post(pipeline, match_id, what)
        assert response.status_code == 422 and response.json()["code"] == "CANDIDATE_ONLY"
    assert await pipeline.balance() == 9


async def test_other_users_matches_are_404(pipeline: Pipeline) -> None:
    match_id = await _candidate_match(pipeline, "user-a")
    for what in ("tailored-bullets", "cover-letter"):
        response = await _post(pipeline, match_id, what, "user-b")
        assert response.status_code == 404 and response.json()["code"] == "NOT_FOUND"
    assert await pipeline.balance("user-b") == 10
    assert (await _post(pipeline, str(uuid.uuid4()), "cover-letter", "user-a")).status_code == 404


async def test_generation_needs_a_token(pipeline: Pipeline) -> None:
    for what in ("tailored-bullets", "cover-letter"):
        response = await pipeline.client.post(f"/v1/matches/{uuid.uuid4()}/{what}")
        assert response.status_code == 401
