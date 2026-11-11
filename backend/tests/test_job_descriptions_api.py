from __future__ import annotations

import hashlib
from collections.abc import Callable

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.errors import AppError
from app.models import UserJd
from app.services.documents import jd_checksum
from app.services.scraping import ScrapedPage
from tests.conftest import Pipeline
from tests.fakes import JD_TEXT


async def _jd_count(sessionmaker: async_sessionmaker[AsyncSession]) -> int:
    async with sessionmaker() as session:
        return int(await session.scalar(select(func.count()).select_from(UserJd)) or 0)


async def _create_ok(p: Pipeline, sub: str = "user-1", **body: object) -> dict:
    job = await p.finish(await p.submit_jd(sub, **body), sub)
    assert job["status"] == "succeeded", job
    return job["result"]["job_description"]


async def test_jd_by_text(pipeline: Pipeline) -> None:
    response = await pipeline.submit_jd(text=JD_TEXT)
    assert response.status_code == 202
    job = await pipeline.finish(response)

    assert job["status"] == "succeeded"
    assert [s["name"] for s in job["steps"]] == ["validating", "analyzing", "saving"]  # no scraping
    jd = job["result"]["job_description"]
    assert jd["jd_url"] is None and jd["mode"] == "candidate"
    assert jd["jd_object"]["job_title"] == "Senior Backend Engineer"
    assert jd["jd_object"]["is_job_description"] is True and jd["jd_object"]["requirements"] == ["5+ years Python"]
    assert pipeline.firecrawl.urls == []
    # extraction goes through the wrapper's "jd" task with the structured schema
    call = pipeline.llm.parse_calls[0]
    assert call["task"] == "jd" and JD_TEXT in call["input"] and JD_TEXT not in call["instructions"]


async def test_jd_by_url_scrapes_first(pipeline: Pipeline) -> None:
    jd = await _create_ok(pipeline, url="https://jobs.example.com/backend-engineer", mode="recruiter")
    assert jd["jd_url"] == "https://jobs.example.com/backend-engineer" and jd["mode"] == "recruiter"
    assert pipeline.firecrawl.urls == ["https://jobs.example.com/backend-engineer"]
    # the scraped text is what the gate and the extractor see
    assert pipeline.llm.decide_calls[0]["input"] == JD_TEXT


async def test_url_job_reports_scraping_step(pipeline: Pipeline) -> None:
    job = await pipeline.finish(await pipeline.submit_jd(url="https://jobs.example.com/1"))
    assert [(s["name"], s["status"]) for s in job["steps"]] == [
        ("scraping", "done"),
        ("validating", "done"),
        ("analyzing", "done"),
        ("saving", "done"),
    ]


async def test_invalid_jd_rejected_and_not_stored(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    pipeline.llm.jd_probability, pipeline.llm.jd_type = 0.1, "company_page"
    job = await pipeline.finish(await pipeline.submit_jd(url="https://acme.example.com/about"))
    assert job["status"] == "failed"
    assert job["error"]["code"] == "INVALID_JD"
    assert "company page" in job["error"]["message"]
    assert await _jd_count(sessionmaker) == 0
    assert pipeline.llm.parse_calls == []  # field extraction never ran


async def test_scrape_failure_fails_the_job(pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    pipeline.firecrawl.error = AppError(504, "SCRAPE_TIMEOUT", "too slow")
    job = await pipeline.finish(await pipeline.submit_jd(url="https://jobs.example.com/1"))
    assert job["status"] == "failed" and job["error"]["code"] == "SCRAPE_TIMEOUT"
    assert await _jd_count(sessionmaker) == 0 and pipeline.llm.decide_calls == []


async def test_scraped_text_over_the_limit_is_what_the_scraper_truncated(
    make_pipeline: Callable[..., Pipeline],
) -> None:
    p = make_pipeline(max_jd_chars=50)
    p.firecrawl.page = ScrapedPage(text="x" * 400)  # a misbehaving scraper
    await _create_ok(p, url="https://jobs.example.com/1")
    assert len(p.llm.decide_calls[0]["input"]) == 50  # defence in depth: never over the limit


async def test_pasted_text_limit(make_pipeline: Callable[..., Pipeline]) -> None:
    p = make_pipeline(max_jd_chars=100)
    response = await p.submit_jd(text="y" * 101)
    assert response.status_code == 422 and response.json()["code"] == "JD_TEXT_TOO_LONG"
    assert response.json()["details"] == {"characters": 101, "max_characters": 100}
    assert (await p.submit_jd(text="y" * 100)).status_code == 202


@pytest.mark.parametrize(
    "body",
    [
        {},  # neither
        {"url": "https://a.example.com", "text": JD_TEXT},  # both
        {"text": "   "},
        {"text": "too short"},  # <= 10 chars once collapsed
        {"url": "ftp://example.com/job"},
        {"url": "not a url"},
        {"url": "https://" + "a" * 3000},
        # Not a public job page: never worth a scrape, and closed in case scraping moves in-house.
        {"url": "http://localhost:8000/v1/credits"},
        {"url": "http://127.0.0.1/admin"},
        {"url": "http://[::1]/x"},
        {"url": "http://10.0.0.1/x"},
        {"url": "http://169.254.169.254/latest/meta-data/"},
        {"url": "http://192.168.1.10/x"},
        {"url": "http://2130706433/x"},  # 127.0.0.1 as a single integer is not a dotted name either
        {"url": "http://minio:9000/resumatch"},
        {"url": "http://printer.local/job"},
        {"url": "http://db.internal/x"},
        {"url": "https://example.com:notaport/x"},
        {"text": JD_TEXT, "mode": "boss"},
        {"text": JD_TEXT, "extra": 1},
    ],
)
async def test_invalid_requests_are_422(pipeline: Pipeline, body: dict) -> None:
    body = {"mode": "candidate", **body}
    response = await pipeline.client.post("/v1/job-descriptions", json=body, headers=pipeline.headers())
    assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"
    assert pipeline.llm.decide_calls == [] and pipeline.firecrawl.urls == []


@pytest.mark.parametrize(
    "url",
    [
        "https://job-boards.greenhouse.io/gitlab/jobs/8771512002",
        "http://jobs.example.com:8080/x?y=1",
        "https://93.184.216.34/job",  # a public IP literal
        "https://[2606:2800:220:1:248:1893:25c8:1946]/job",
    ],
)
async def test_public_urls_are_accepted(pipeline: Pipeline, url: str) -> None:
    response = await pipeline.client.post(
        "/v1/job-descriptions", json={"url": url, "mode": "candidate"}, headers=pipeline.headers()
    )
    assert response.status_code == 202


async def test_mode_is_required(pipeline: Pipeline) -> None:
    response = await pipeline.client.post("/v1/job-descriptions", json={"text": JD_TEXT}, headers=pipeline.headers())
    assert response.status_code == 422


async def test_dedup_per_user_source_and_mode(pipeline: Pipeline) -> None:
    first = await _create_ok(pipeline, text=JD_TEXT)
    again = await pipeline.submit_jd(text=JD_TEXT)
    assert again.status_code == 409 and again.json()["code"] == "DUPLICATE_JD"
    assert again.json()["details"]["jd_id"] == first["id"]

    # other user, other mode, and url-vs-text are all distinct records
    assert (await pipeline.submit_jd("user-2", text=JD_TEXT)).status_code == 202
    assert (await pipeline.submit_jd(text=JD_TEXT, mode="recruiter")).status_code == 202
    url = "https://jobs.example.com/x"
    await _create_ok(pipeline, url=url)
    assert (await pipeline.submit_jd(url=url)).status_code == 409


async def test_rejected_jd_can_be_retried(pipeline: Pipeline) -> None:
    pipeline.llm.jd_probability = 0.1
    assert (await pipeline.finish(await pipeline.submit_jd(text=JD_TEXT)))["status"] == "failed"
    pipeline.llm.jd_probability = 0.9
    assert (await pipeline.finish(await pipeline.submit_jd(text=JD_TEXT)))["status"] == "succeeded"


def test_checksum_matches_the_n8n_recipe() -> None:
    assert jd_checksum("https://x.test/1", True, "u1") == hashlib.sha256(b"https://x.test/1trueu1").hexdigest()
    assert jd_checksum("some text", False, "u2") == hashlib.sha256(b"some textfalseu2").hexdigest()


async def test_list_read_delete_and_isolation(pipeline: Pipeline) -> None:
    empty = await pipeline.client.get("/v1/job-descriptions", headers=pipeline.headers())
    assert empty.json() == [] and empty.headers["x-total-count"] == "0"

    first = await _create_ok(pipeline, text=JD_TEXT + " one")
    second = await _create_ok(pipeline, text=JD_TEXT + " two")
    other = await _create_ok(pipeline, "user-2", text=JD_TEXT + " theirs")

    listing = await pipeline.client.get("/v1/job-descriptions", headers=pipeline.headers())
    assert [j["id"] for j in listing.json()] == [second["id"], first["id"]]  # newest first
    assert listing.headers["x-total-count"] == "2"

    page = await pipeline.client.get("/v1/job-descriptions?limit=1&offset=1", headers=pipeline.headers())
    assert [j["id"] for j in page.json()] == [first["id"]] and page.headers["x-total-count"] == "2"

    got = await pipeline.client.get(f"/v1/job-descriptions/{first['id']}", headers=pipeline.headers())
    assert got.status_code == 200 and got.json() == first

    for method in ("GET", "DELETE"):  # user-1 cannot touch user-2's JD
        denied = await pipeline.client.request(method, f"/v1/job-descriptions/{other['id']}", headers=pipeline.headers())
        assert denied.status_code == 404 and denied.json()["code"] == "NOT_FOUND"

    assert (await pipeline.client.delete(f"/v1/job-descriptions/{first['id']}", headers=pipeline.headers())).status_code == 204
    assert (await pipeline.client.get(f"/v1/job-descriptions/{first['id']}", headers=pipeline.headers())).status_code == 404
    left = await pipeline.client.get("/v1/job-descriptions", headers=pipeline.headers())
    assert [j["id"] for j in left.json()] == [second["id"]]


async def test_list_pagination_bounds(pipeline: Pipeline) -> None:
    for query in ("limit=0", "limit=501", "offset=-1"):
        response = await pipeline.client.get(f"/v1/job-descriptions?{query}", headers=pipeline.headers())
        assert response.status_code == 422


async def test_requires_auth(pipeline: Pipeline) -> None:
    assert (await pipeline.client.post("/v1/job-descriptions", json={"text": JD_TEXT, "mode": "candidate"})).status_code == 401
    assert (await pipeline.client.get("/v1/job-descriptions")).status_code == 401
