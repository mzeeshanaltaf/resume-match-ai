"""Firecrawl client against httpx.MockTransport (no network)."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.errors import AppError
from app.services.scraping import FirecrawlClient


class Firecrawl:
    """Scriptable fake of the two batch-scrape endpoints."""

    def __init__(self, polls: list[Any], start: Any | None = None) -> None:
        self.polls = list(polls)
        self.start = start or httpx.Response(200, json={"success": True, "id": "job-1"})
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.method == "POST":
            return self.start
        item = self.polls.pop(0) if len(self.polls) > 1 else self.polls[0]
        return item if isinstance(item, httpx.Response) else httpx.Response(200, json=item)


def _client(settings: Settings, fake: Firecrawl) -> FirecrawlClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(fake), base_url="https://fc.test")
    return FirecrawlClient(settings, http=http)


def _fast(make_settings: Callable[..., Settings], **kw: Any) -> Settings:
    return make_settings(firecrawl_poll_interval_seconds=0.01, firecrawl_timeout_seconds=0.2, **kw)


def _done(markdown: str = "# Job", **meta: Any) -> dict[str, Any]:
    return {"status": "completed", "data": [{"markdown": markdown, "metadata": meta}]}


async def test_polls_until_completed(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([{"status": "scraping", "data": []}, {"status": "scraping", "data": []}, _done("# Role\nDetails", title="Role")])
    page = await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert page.text == "# Role\nDetails" and page.title == "Role"

    start = fake.requests[0]
    assert start.url.path == "/v2/batch/scrape"
    assert json.loads(start.content) == {"urls": ["https://jobs.test/1"], "formats": ["markdown"]}
    assert sum(r.method == "GET" for r in fake.requests) == 3


async def test_description_is_appended_like_the_n8n_flow(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([_done("Body", description="Short blurb")])
    page = await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert page.text == "Body\n\nShort blurb"


async def test_truncates_to_max_jd_chars(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([_done("x" * 500)])
    page = await _client(_fast(make_settings, max_jd_chars=100), fake).scrape("https://jobs.test/1")
    assert len(page.text) == 100 and page.truncated


@pytest.mark.parametrize("status", ["failed", "cancelled"])
async def test_failed_scrape_is_reported(status: str, make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([{"status": status, "data": []}])
    with pytest.raises(AppError) as exc:
        await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert (exc.value.status_code, exc.value.code) == (502, "SCRAPE_FAILED")


async def test_polling_is_bounded(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([{"status": "scraping", "data": []}])  # never finishes
    with pytest.raises(AppError) as exc:
        await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert (exc.value.status_code, exc.value.code) == (504, "SCRAPE_TIMEOUT")
    assert len(fake.requests) < 40  # bounded by the budget, not unbounded


async def test_empty_page(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([_done("   ")])
    with pytest.raises(AppError) as exc:
        await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert (exc.value.status_code, exc.value.code) == (422, "SCRAPE_EMPTY")


async def test_http_error_status_on_the_scraped_page(make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([_done("Not found page", statusCode=404)])
    with pytest.raises(AppError) as exc:
        await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert exc.value.code == "SCRAPE_FAILED" and "404" in exc.value.message


@pytest.mark.parametrize(("status", "code"), [(402, "SCRAPE_UNAVAILABLE"), (429, "SCRAPE_BUSY"), (500, "SCRAPE_FAILED")])
async def test_firecrawl_http_errors(status: int, code: str, make_settings: Callable[..., Settings]) -> None:
    fake = Firecrawl([], start=httpx.Response(status, json={"error": "x"}))
    with pytest.raises(AppError) as exc:
        await _client(_fast(make_settings), fake).scrape("https://jobs.test/1")
    assert exc.value.code == code


async def test_network_failure(make_settings: Callable[..., Settings]) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    http = httpx.AsyncClient(transport=httpx.MockTransport(boom), base_url="https://fc.test")
    with pytest.raises(AppError) as exc:
        await FirecrawlClient(_fast(make_settings), http=http).scrape("https://jobs.test/1")
    assert exc.value.code == "SCRAPE_FAILED"


async def test_missing_api_key(settings: Settings) -> None:
    with pytest.raises(AppError) as exc:
        await FirecrawlClient(settings).scrape("https://jobs.test/1")
    assert (exc.value.status_code, exc.value.code) == (503, "SCRAPING_NOT_CONFIGURED")
