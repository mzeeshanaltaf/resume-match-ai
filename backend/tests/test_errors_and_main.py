from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from pydantic import BaseModel

from app.errors import AppError
from app.main import create_app


class _Body(BaseModel):
    name: str
    age: int


@pytest.fixture
def err_app(app: FastAPI) -> FastAPI:
    @app.get("/_app_error")
    async def app_error() -> None:
        raise AppError(422, "INVALID_RESUME", "This looks like a cover letter.", {"found": "cover_letter"})

    @app.get("/_boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    @app.post("/_body")
    async def body(payload: _Body) -> dict[str, str]:
        return {"name": payload.name}

    return app


@pytest.fixture
async def ec(err_app: FastAPI) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=err_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


def _shape(response: httpx.Response) -> dict[str, Any]:
    body = response.json()
    assert set(body) == {"code", "message", "details"}, body
    return body


async def test_health(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_app_error_shape(ec: httpx.AsyncClient) -> None:
    response = await ec.get("/_app_error")
    assert response.status_code == 422
    assert _shape(response) == {
        "code": "INVALID_RESUME",
        "message": "This looks like a cover letter.",
        "details": {"found": "cover_letter"},
    }


async def test_unknown_route_uses_error_shape(ec: httpx.AsyncClient) -> None:
    response = await ec.get("/nope")
    assert response.status_code == 404
    assert _shape(response)["code"] == "NOT_FOUND"


async def test_method_not_allowed_uses_error_shape(ec: httpx.AsyncClient) -> None:
    response = await ec.post("/health")
    assert response.status_code == 405
    assert _shape(response)["code"] == "METHOD_NOT_ALLOWED"


async def test_validation_error_shape(ec: httpx.AsyncClient) -> None:
    response = await ec.post("/_body", json={"name": "x", "age": "not-a-number"})
    assert response.status_code == 422
    body = _shape(response)
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"][0]["loc"] == ["body", "age"]


async def test_unhandled_exception_is_500_without_leaking(ec: httpx.AsyncClient) -> None:
    response = await ec.get("/_boom")
    assert response.status_code == 500
    body = _shape(response)
    assert body["code"] == "INTERNAL_ERROR"
    assert "secret" not in response.text


async def test_cors_allows_only_configured_origin(client: httpx.AsyncClient) -> None:
    allowed = await client.options(
        "/health",
        headers={"Origin": "https://app.test", "Access-Control-Request-Method": "GET"},
    )
    assert allowed.headers.get("access-control-allow-origin") == "https://app.test"

    denied = await client.options(
        "/health",
        headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in denied.headers


async def test_cors_exposes_the_headers_the_browser_client_reads(client: httpx.AsyncClient) -> None:
    response = await client.get("/health", headers={"Origin": "https://app.test"})
    exposed = {h.strip().lower() for h in response.headers["access-control-expose-headers"].split(",")}
    # list totals, the export filename and the export retry delay (all read by the frontend)
    assert {"x-total-count", "content-disposition", "retry-after"} <= exposed


async def test_docs_hidden_in_production(make_settings: Callable[..., Any]) -> None:
    prod = create_app(make_settings(environment="prod"))
    transport = httpx.ASGITransport(app=prod, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        assert (await http.get("/docs")).status_code == 404
        assert (await http.get("/openapi.json")).status_code == 404


async def test_protected_route_requires_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/credits")
    assert response.status_code == 401
    assert _shape(response)["code"] == "AUTH_REQUIRED"


# ── With a database ─────────────────────────────────────────────────────────


async def test_credits_with_token_creates_account_with_signup_credits(
    db_client: httpx.AsyncClient, bearer: Callable[..., dict]
) -> None:
    response = await db_client.get("/v1/credits", headers=bearer(sub="new-user", email="a@example.com"))
    assert response.status_code == 200
    assert response.json()["balance"] == 10
    # Second call does not grant again.
    again = await db_client.get("/v1/credits", headers=bearer(sub="new-user", email="a@example.com"))
    assert again.json()["balance"] == 10


async def test_credits_for_re_registered_deleted_email_starts_at_zero(
    db_client: httpx.AsyncClient, bearer: Callable[..., dict], session: Any, settings: Any
) -> None:
    from app.services import credits

    await credits.record_deleted_account(session, "Gone@Example.com", settings)
    await session.commit()
    response = await db_client.get("/v1/credits", headers=bearer(sub="reborn", email="gone@example.com"))
    assert response.json()["balance"] == 0
