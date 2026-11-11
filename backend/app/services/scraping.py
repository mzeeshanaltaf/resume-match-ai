"""Firecrawl job-page scraping (v2 batch scrape, one URL, bounded polling).

Mirrors the n8n flow (start a batch scrape, poll until done) but with the failure handling
that flow lacked: the total wait is bounded by ``FIRECRAWL_TIMEOUT_SECONDS``, a failed or
cancelled scrape, an HTTP error status on the scraped page, and an empty page each produce
a specific error instead of hanging. The scraped text is truncated to ``MAX_JD_CHARS``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.errors import AppError

logger = logging.getLogger(__name__)

_TERMINAL_FAILURES = {"failed", "cancelled"}


@dataclass(frozen=True)
class ScrapedPage:
    text: str  # markdown (+ page description), truncated to MAX_JD_CHARS
    title: str | None = None
    truncated: bool = False


def _scrape_error(code: str, message: str, status: int = 502, details: Any = None) -> AppError:
    return AppError(status, code, message, details)


class FirecrawlClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._http = http

    # ── HTTP ────────────────────────────────────────────────────────────────

    def _client(self) -> httpx.AsyncClient:
        if self._http is not None:
            return self._http
        if not self._settings.firecrawl_api_key:
            raise _scrape_error(
                "SCRAPING_NOT_CONFIGURED", "Link scraping is not configured.", status=503
            )
        return httpx.AsyncClient(
            base_url=self._settings.firecrawl_base_url,
            headers={"Authorization": f"Bearer {self._settings.firecrawl_api_key}"},
            timeout=30,
        )

    @staticmethod
    def _check(response: httpx.Response) -> dict[str, Any]:
        if response.status_code == 402:
            logger.error("Firecrawl reports payment required (402): out of credits?")
            raise _scrape_error("SCRAPE_UNAVAILABLE", "Link scraping is unavailable right now.")
        if response.status_code == 429:
            raise _scrape_error(
                "SCRAPE_BUSY", "The scraping service is busy. Try again shortly.", status=503
            )
        if response.status_code >= 400:
            logger.error("Firecrawl HTTP %s: %s", response.status_code, response.text[:300])
            raise _scrape_error("SCRAPE_FAILED", "Could not scrape that link.")
        try:
            body = response.json()
        except ValueError as exc:
            raise _scrape_error("SCRAPE_FAILED", "Could not scrape that link.") from exc
        if not isinstance(body, dict):
            raise _scrape_error("SCRAPE_FAILED", "Could not scrape that link.")
        return body

    # ── Public API ──────────────────────────────────────────────────────────

    async def scrape(self, url: str) -> ScrapedPage:
        client = self._client()
        owns_client = self._http is None
        try:
            return await self._scrape(client, url)
        except httpx.HTTPError as exc:
            logger.warning("Firecrawl request failed: %s", exc)
            raise _scrape_error("SCRAPE_FAILED", "Could not reach the scraping service.") from exc
        finally:
            if owns_client:
                await client.aclose()

    async def _scrape(self, client: httpx.AsyncClient, url: str) -> ScrapedPage:
        settings = self._settings
        started = self._check(
            await client.post("/v2/batch/scrape", json={"urls": [url], "formats": ["markdown"]})
        )
        job_id = started.get("id")
        if not started.get("success", True) or not isinstance(job_id, str):
            raise _scrape_error("SCRAPE_FAILED", "Could not start scraping that link.")

        deadline = time.monotonic() + settings.firecrawl_timeout_seconds
        while True:
            body = self._check(await client.get(f"/v2/batch/scrape/{job_id}"))
            status = body.get("status")
            if status == "completed":
                return self._page_from(body)
            if status in _TERMINAL_FAILURES:
                raise _scrape_error("SCRAPE_FAILED", "Scraping that link failed.")
            if time.monotonic() + settings.firecrawl_poll_interval_seconds > deadline:
                raise _scrape_error(
                    "SCRAPE_TIMEOUT",
                    "Scraping that link took too long. Try again or paste the job text instead.",
                    status=504,
                )
            await asyncio.sleep(settings.firecrawl_poll_interval_seconds)

    def _page_from(self, body: dict[str, Any]) -> ScrapedPage:
        data = body.get("data") or []
        item = data[0] if data and isinstance(data[0], dict) else {}
        metadata = item.get("metadata") or {}

        status_code = metadata.get("statusCode")
        if metadata.get("error") or (isinstance(status_code, int) and status_code >= 400):
            raise _scrape_error(
                "SCRAPE_FAILED",
                "That link could not be loaded"
                + (f" (the site answered {status_code})." if status_code else "."),
                details={"status_code": status_code},
            )

        parts = [
            str(item.get("markdown") or "").strip(),
            str(metadata.get("description") or "").strip(),
        ]
        text = "\n\n".join(part for part in parts if part)
        if not text:
            raise _scrape_error(
                "SCRAPE_EMPTY",
                "That page had no readable text. Paste the job text instead.",
                status=422,
            )

        limit = self._settings.max_jd_chars
        truncated = len(text) > limit
        title = metadata.get("title")
        return ScrapedPage(
            text=text[:limit], title=title if isinstance(title, str) else None, truncated=truncated
        )


_clients: dict[int, FirecrawlClient] = {}


def get_firecrawl(settings: Annotated[Settings, Depends(get_settings)]) -> FirecrawlClient:
    """FastAPI dependency. Override in tests with a fake exposing ``scrape(url)``."""
    client = _clients.get(id(settings))
    if client is None or client._settings is not settings:
        client = _clients[id(settings)] = FirecrawlClient(settings)
    return client
