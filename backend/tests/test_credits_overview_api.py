"""GET /v1/credits, /v1/credits/transactions and /v1/overview."""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.errors import AppError
from app.services import credits
from tests.conftest import Pipeline


# ── Credits ─────────────────────────────────────────────────────────────────


async def test_credits_creates_the_account_once_and_lists_prices(pipeline: Pipeline) -> None:
    first = await pipeline.client.get("/v1/credits", headers=pipeline.headers(email="a@example.com"))
    assert first.status_code == 200
    assert first.json() == {
        "balance": 10,
        "costs": {"match": 1, "cover_letter": 1, "screening_per_resume": 1},
    }
    again = await pipeline.client.get("/v1/credits", headers=pipeline.headers(email="a@example.com"))
    assert again.json()["balance"] == 10  # no second grant
    ledger = await pipeline.transactions()
    assert [t["transaction_type"] for t in ledger] == ["signup_bonus"]


async def test_prices_come_from_settings(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(match_credit_cost=2, cover_letter_credit_cost=3, screening_credit_cost_per_resume=4)
    body = (await pipeline.client.get("/v1/credits", headers=pipeline.headers())).json()
    assert body["costs"] == {"match": 2, "cover_letter": 3, "screening_per_resume": 4}


async def test_a_match_costs_the_configured_amount(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(match_credit_cost=3)
    resume, jd = await pipeline.pair()
    await pipeline.match_ok(resume["id"], jd["id"])
    assert await pipeline.balance() == 7


async def test_empty_ledger_is_an_empty_list(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(signup_credits=0)  # no bonus row is written for 0 credits
    response = await pipeline.client.get("/v1/credits/transactions", headers=pipeline.headers())
    assert response.status_code == 200 and response.json() == []
    assert response.headers["x-total-count"] == "0"


async def test_ledger_is_newest_first(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair()
    await pipeline.match_ok(resume["id"], jd["id"])
    pipeline.llm.error = AppError(504, "LLM_TIMEOUT", "slow")
    await pipeline.finish(await pipeline.post_match(resume["id"], jd["id"]))

    ledger = await pipeline.transactions()
    assert [(t["transaction_type"], t["credits_delta"]) for t in ledger] == [
        ("refund", 1),
        ("match_analysis", -1),  # the failed one
        ("match_analysis", -1),  # the delivered one
        ("signup_bonus", 10),
    ]
    assert ledger[0]["description"].startswith("Refund:")
    assert ledger[1]["reference_id"] == ledger[0]["reference_id"]
    assert set(ledger[0]) == {
        "id", "transaction_type", "credits_delta", "reference_id", "name_snapshot", "description", "created_at",
    }


async def test_ledger_has_no_hidden_cap_and_supports_paging(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    await pipeline.balance()  # creates the account with its signup bonus
    async with sessionmaker() as session:
        await session.execute(
            text(
                "UPDATE resume_match.user_credit_accounts SET current_balance = 500 WHERE user_id = 'user-1'"
            )
        )
        for _ in range(120):
            await credits.reserve(session, "user-1", 1, "match_analysis")
        await session.commit()

    everything = await pipeline.client.get("/v1/credits/transactions", headers=pipeline.headers())
    assert len(everything.json()) == 121 and everything.headers["x-total-count"] == "121"

    page = await pipeline.client.get("/v1/credits/transactions?limit=10&offset=115", headers=pipeline.headers())
    assert len(page.json()) == 6 and page.headers["x-total-count"] == "121"
    ids = [t["id"] for t in everything.json()]
    assert [t["id"] for t in page.json()] == ids[115:]
    assert (await pipeline.client.get("/v1/credits/transactions?limit=0", headers=pipeline.headers())).status_code == 422


async def test_credit_endpoints_are_isolated_and_need_a_token(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair("user-a")
    await pipeline.match_ok(resume["id"], jd["id"], "user-a")
    assert await pipeline.balance("user-b") == 10
    assert [t["transaction_type"] for t in await pipeline.transactions("user-b")] == ["signup_bonus"]
    for url in ("/v1/credits", "/v1/credits/transactions", "/v1/overview"):
        assert (await pipeline.client.get(url)).status_code == 401


# ── Overview ────────────────────────────────────────────────────────────────


async def test_overview_for_a_new_user_is_all_zeros_with_the_signup_balance(pipeline: Pipeline) -> None:
    response = await pipeline.client.get("/v1/overview", headers=pipeline.headers())
    assert response.status_code == 200
    assert response.json() == {
        "balance": 10,
        "counts": {"resumes": 0, "job_descriptions": 0, "matches": 0},
        "recent_matches": [],
    }


async def test_overview_counts_balance_and_recent_matches(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(overview_recent_matches=2)
    resume, jd = await pipeline.pair()
    other_resume, _ = await pipeline.pair(n=1)
    ids = []
    for resume_id in (resume["id"], other_resume["id"], resume["id"]):
        pipeline.llm.match_score += 1
        ids.append((await pipeline.match_ok(resume_id, jd["id"]))["match_id"])

    body = (await pipeline.client.get("/v1/overview", headers=pipeline.headers())).json()
    assert body["balance"] == 7
    assert body["counts"] == {"resumes": 2, "job_descriptions": 2, "matches": 3}
    assert [m["id"] for m in body["recent_matches"]] == ids[::-1][:2]  # newest first, capped by the setting
    assert body["recent_matches"][0]["overall_score_percent"] == 85
    assert body["recent_matches"][0]["job_title"] == "Senior Backend Engineer"


async def test_overview_is_per_user(pipeline: Pipeline) -> None:
    resume, jd = await pipeline.pair("user-a")
    await pipeline.match_ok(resume["id"], jd["id"], "user-a")
    body = (await pipeline.client.get("/v1/overview", headers=pipeline.headers("user-b"))).json()
    assert body["counts"] == {"resumes": 0, "job_descriptions": 0, "matches": 0}
    assert body["recent_matches"] == [] and body["balance"] == 10
