"""POST /v1/screenings: batch job, per-resume progress, ranking, refunds, cap, ownership."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable
from typing import Any

import pytest

from app.errors import AppError
from tests.conftest import Pipeline
from tests.fakes import make_pdf, unique_resume_text


async def _resumes(pipeline: Pipeline, count: int, sub: str = "user-1") -> list[dict[str, Any]]:
    return [
        await pipeline.upload_ok(
            make_pdf(text=unique_resume_text(100 + i)), f"cand-{i}.pdf", mode="recruiter", sub=sub
        )
        for i in range(count)
    ]


async def _screen(
    pipeline: Pipeline, resume_ids: list[str], jd_id: str, sub: str = "user-1"
) -> Any:
    return await pipeline.client.post(
        "/v1/screenings", json={"resume_ids": resume_ids, "jd_id": jd_id}, headers=pipeline.headers(sub)
    )


def _score_by_reference(scores: dict[str, int]) -> Callable[[Any], int]:
    """Score a recruiter prompt by the 'Reference number N' line unique to each resume."""

    def _score(prompt: Any) -> int:
        for marker, score in scores.items():
            if f"Reference number {marker}" in prompt:
                return score
        raise AssertionError("unknown resume in prompt")

    return _score


async def test_screening_ranks_best_first_and_charges_one_credit_per_resume(pipeline: Pipeline) -> None:
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    pipeline.llm.score_for = _score_by_reference({"100": 55, "101": 91, "102": 73})

    response = await _screen(pipeline, [r["id"] for r in resumes], jd["id"])
    assert response.status_code == 202
    job = await pipeline.finish(response)
    assert job["status"] == "succeeded" and job["kind"] == "screening"

    result = job["result"]
    assert result["jd_id"] == jd["id"] and result["failed"] == [] and result["refunded_credits"] == 0
    assert [(r["rank"], r["overall_score_percent"], r["file_name"]) for r in result["ranked"]] == [
        (1, 91, "cand-1.pdf"),
        (2, 73, "cand-2.pdf"),
        (3, 55, "cand-0.pdf"),
    ]
    assert result["ranked"][0]["rationale"] and result["ranked"][0]["score_confidence"]

    assert await pipeline.balance() == 7
    ledger = await pipeline.transactions()
    assert sorted(t["transaction_type"] for t in ledger if t["transaction_type"] == "screening") == ["screening"] * 3
    # Every ranked row drills down into its own stored match.
    for row in result["ranked"]:
        match = await pipeline.client.get(f"/v1/matches/{row['match_id']}", headers=pipeline.headers())
        assert match.status_code == 200 and match.json()["resume_id"] == row["resume_id"]
        assert match.json()["mode"] == "recruiter"
    assert len((await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json()) == 3


async def test_ties_keep_the_submission_order(pipeline: Pipeline) -> None:
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    pipeline.llm.match_score = 70  # all equal
    order = [resumes[2]["id"], resumes[0]["id"], resumes[1]["id"]]
    job = await pipeline.finish(await _screen(pipeline, order, jd["id"]))
    assert [r["resume_id"] for r in job["result"]["ranked"]] == order


async def test_progress_has_one_step_per_resume_then_ranking(pipeline: Pipeline) -> None:
    resumes = await _resumes(pipeline, 2)
    jd = await pipeline.jd_ok(mode="recruiter")
    job = await pipeline.finish(await _screen(pipeline, [r["id"] for r in resumes], jd["id"]))
    names = [s["name"] for s in job["steps"]]
    assert sorted(names[:2]) == sorted(f"score:{r['id']}" for r in resumes)
    assert names[2] == "ranking"
    assert all(s["status"] == "done" for s in job["steps"])
    assert {s["label"] for s in job["steps"][:2]} == {"Scoring cand-0.pdf", "Scoring cand-1.pdf"}

    events = await pipeline.client.get(f"/v1/jobs/{job['id']}/events", headers=pipeline.headers())
    assert events.text.count("event: step") >= 5  # running+done per resume, and ranking
    assert "event: succeeded" in events.text


async def test_scoring_runs_with_bounded_concurrency(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(screening_concurrency=2)
    resumes = await _resumes(pipeline, 5)
    jd = await pipeline.jd_ok(mode="recruiter")
    running = peak = 0

    async def hook(task: str, schema: type, input: Any) -> None:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.05)
        running -= 1

    pipeline.llm.parse_hook = hook
    job = await pipeline.finish(await _screen(pipeline, [r["id"] for r in resumes], jd["id"]))
    assert job["status"] == "succeeded"
    assert peak == 2


async def test_failed_items_are_refunded_and_reported_the_rest_are_kept(pipeline: Pipeline) -> None:
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    pipeline.llm.score_for = _score_by_reference({"100": 60, "101": 80, "102": 70})

    async def fail_one(task: str, schema: type, input: Any) -> None:
        if "Reference number 101" in input:
            raise AppError(502, "LLM_BAD_OUTPUT", "unusable")

    pipeline.llm.parse_hook = fail_one
    job = await pipeline.finish(await _screen(pipeline, [r["id"] for r in resumes], jd["id"]))
    assert job["status"] == "succeeded"
    result = job["result"]
    assert [r["file_name"] for r in result["ranked"]] == ["cand-2.pdf", "cand-0.pdf"]
    assert [(f["file_name"], f["error"]["code"]) for f in result["failed"]] == [("cand-1.pdf", "LLM_BAD_OUTPUT")]
    assert result["refunded_credits"] == 1
    assert [s["status"] for s in job["steps"] if s["name"] == f"score:{resumes[1]['id']}"] == ["failed"]

    assert await pipeline.balance() == 8  # 3 reserved, 1 refunded
    ledger = await pipeline.transactions()
    refunds = [t for t in ledger if t["transaction_type"] == "refund"]
    assert len(refunds) == 1 and refunds[0]["credits_delta"] == 1


async def test_all_items_failing_fails_the_job_and_refunds_everything_once(pipeline: Pipeline) -> None:
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    pipeline.llm.error = AppError(504, "LLM_TIMEOUT", "slow")
    job = await pipeline.finish(await _screen(pipeline, [r["id"] for r in resumes], jd["id"]))
    assert job["status"] == "failed" and job["error"]["code"] == "SCREENING_FAILED"
    assert len(job["error"]["details"]["failed"]) == 3
    assert await pipeline.balance() == 10
    ledger = await pipeline.transactions()
    assert sum(1 for t in ledger if t["transaction_type"] == "refund") == 3  # not 6


async def test_insufficient_credits_is_all_or_nothing(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=2)
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    response = await _screen(pipeline, [r["id"] for r in resumes], jd["id"])
    assert response.status_code == 402
    assert response.json()["details"] == {"needed": 3, "balance": 2}
    assert await pipeline.balance() == 2  # nothing was reserved
    assert [c for c in pipeline.llm.parse_calls if c["task"] == "match"] == []


async def test_concurrent_screenings_never_overspend(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=5)
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    ids = [r["id"] for r in resumes]

    responses = await asyncio.gather(*(_screen(pipeline, ids, jd["id"]) for _ in range(4)))
    assert sorted(r.status_code for r in responses) == [202, 402, 402, 402]  # only one batch of 3 fits in 5
    await pipeline.runner.wait_idle()
    assert await pipeline.balance() == 2


async def test_mixed_screening_and_match_spend_stays_consistent(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=4)
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    ids = [r["id"] for r in resumes]

    responses = await asyncio.gather(
        _screen(pipeline, ids, jd["id"]),
        *(pipeline.post_match(ids[0], jd["id"]) for _ in range(3)),
    )
    screening_ok = responses[0].status_code == 202
    matches_ok = sum(r.status_code == 202 for r in responses[1:])
    assert all(r.status_code in (202, 402) for r in responses)
    await pipeline.runner.wait_idle()
    spent = (3 if screening_ok else 0) + matches_ok
    assert spent <= 4  # never more than the balance, whatever order the requests landed in
    assert await pipeline.balance() == 4 - spent
    # Whatever was charged was delivered: one match row per charged credit.
    assert len((await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json()) == spent


async def test_cap_on_resumes_per_screening(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(max_screening_resumes=2)
    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    response = await _screen(pipeline, [r["id"] for r in resumes], jd["id"])
    assert response.status_code == 422 and response.json()["code"] == "TOO_MANY_RESUMES"
    assert response.json()["details"] == {"max_resumes": 2, "received": 3}
    ok = await _screen(pipeline, [r["id"] for r in resumes[:2]], jd["id"])  # exactly at the cap
    assert ok.status_code == 202


@pytest.mark.parametrize(
    "body",
    [
        {"resume_ids": [], "jd_id": str(uuid.uuid4())},
        {"jd_id": str(uuid.uuid4())},
        {"resume_ids": ["x"], "jd_id": str(uuid.uuid4())},
        {"resume_ids": [str(uuid.UUID(int=1))] * 2, "jd_id": str(uuid.uuid4())},  # duplicates
    ],
)
async def test_invalid_bodies_are_422(pipeline: Pipeline, body: dict[str, Any]) -> None:
    response = await pipeline.client.post("/v1/screenings", json=body, headers=pipeline.headers())
    assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"


async def test_unknown_or_foreign_resumes_and_jds_are_404(pipeline: Pipeline) -> None:
    mine = await _resumes(pipeline, 1, "user-a")
    theirs = await _resumes(pipeline, 1, "user-b")
    jd_a = await pipeline.jd_ok("user-a", mode="recruiter")
    jd_b = await pipeline.jd_ok("user-b", mode="recruiter", n=1)

    foreign_resume = await _screen(pipeline, [mine[0]["id"], theirs[0]["id"]], jd_a["id"], "user-a")
    assert foreign_resume.status_code == 404
    assert foreign_resume.json()["details"] == {"resume_ids": [theirs[0]["id"]]}
    foreign_jd = await _screen(pipeline, [mine[0]["id"]], jd_b["id"], "user-a")
    assert foreign_jd.status_code == 404
    assert await pipeline.balance("user-a") == 10


async def test_screening_is_recruiter_only(pipeline: Pipeline) -> None:
    candidate = await pipeline.upload_ok(make_pdf(text=unique_resume_text(7)), "c.pdf", mode="candidate")
    jd = await pipeline.jd_ok(mode="candidate")
    response = await _screen(pipeline, [candidate["id"]], jd["id"])
    assert response.status_code == 422 and response.json()["code"] == "MODE_MISMATCH"
    assert response.json()["details"]["required_mode"] == "recruiter"
    assert await pipeline.balance() == 10


async def test_screening_needs_a_token(pipeline: Pipeline) -> None:
    response = await pipeline.client.post("/v1/screenings", json={})
    assert response.status_code == 401


async def test_interrupted_screening_refunds_only_what_was_not_delivered(
    pipeline: Pipeline, sessionmaker: Any
) -> None:
    """A restart mid-screening keeps the finished items and refunds the unfinished ones."""
    from app.services.runner import build_runner

    resumes = await _resumes(pipeline, 3)
    jd = await pipeline.jd_ok(mode="recruiter")
    gate = asyncio.Event()

    async def block_second_and_third(task: str, schema: type, input: Any) -> None:
        if "Reference number 100" not in input:
            gate.set()
            await asyncio.Event().wait()

    pipeline.llm.parse_hook = block_second_and_third
    response = await _screen(pipeline, [r["id"] for r in resumes], jd["id"])
    await gate.wait()
    await asyncio.sleep(0.2)  # let item 0 finish and save
    assert await pipeline.balance() == 7

    fresh = build_runner(lambda: sessionmaker, pipeline.settings)
    assert await fresh.recover_interrupted() == 1
    assert await pipeline.balance() == 9  # item 0 delivered (kept), items 1 and 2 refunded
    matches = (await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json()
    assert [m["resume_file_name"] for m in matches] == ["cand-0.pdf"]

    await pipeline.runner.shutdown()
    assert await pipeline.balance() == 9
    _ = response
