from __future__ import annotations

import json
from collections.abc import Callable
from typing import Annotated, Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import Depends, FastAPI
from jwt.algorithms import OKPAlgorithm

from app.auth import (
    JWKSKeyStore,
    StaticKeyStore,
    current_user,
    get_key_store,
    require_internal_key,
)
from app.config import get_settings
from app.errors import AppError
from tests.conftest import KID


@pytest.fixture
def protected_app(app: FastAPI) -> FastAPI:
    @app.get("/_whoami")
    async def whoami(user_id: Annotated[str, Depends(current_user)]) -> dict[str, str]:
        return {"user_id": user_id}

    @app.get("/_internal", dependencies=[Depends(require_internal_key)])
    async def internal() -> dict[str, bool]:
        return {"ok": True}

    return app


@pytest.fixture
async def pclient(protected_app: FastAPI) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=protected_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


async def _assert_rejected(
    response: httpx.Response, code: str, status: int = 401
) -> dict[str, Any]:
    assert response.status_code == status, response.text
    body = response.json()
    assert body["code"] == code
    assert set(body) == {"code", "message", "details"}
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"
    return body


async def test_valid_token_returns_sub(pclient: httpx.AsyncClient, bearer: Callable[..., dict]) -> None:
    response = await pclient.get("/_whoami", headers=bearer(sub="user-42"))
    assert response.status_code == 200
    assert response.json() == {"user_id": "user-42"}


async def test_missing_authorization_header(pclient: httpx.AsyncClient) -> None:
    await _assert_rejected(await pclient.get("/_whoami"), "AUTH_REQUIRED")


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "Bearer   ", "token-without-scheme"])
async def test_malformed_authorization_header(pclient: httpx.AsyncClient, header: str) -> None:
    await _assert_rejected(
        await pclient.get("/_whoami", headers={"Authorization": header}), "AUTH_REQUIRED"
    )


async def test_garbage_token(pclient: httpx.AsyncClient) -> None:
    response = await pclient.get("/_whoami", headers={"Authorization": "Bearer not.a.jwt"})
    await _assert_rejected(response, "INVALID_TOKEN")


async def test_expired_token(pclient: httpx.AsyncClient, bearer: Callable[..., dict]) -> None:
    # Past the configured leeway as well.
    response = await pclient.get("/_whoami", headers=bearer(expires_in=-3600))
    await _assert_rejected(response, "TOKEN_EXPIRED")


async def test_wrong_issuer(pclient: httpx.AsyncClient, bearer: Callable[..., dict]) -> None:
    response = await pclient.get("/_whoami", headers=bearer(issuer="https://evil.example"))
    body = await _assert_rejected(response, "INVALID_TOKEN")
    assert "issuer" in body["message"].lower()


async def test_wrong_audience(pclient: httpx.AsyncClient, bearer: Callable[..., dict]) -> None:
    response = await pclient.get("/_whoami", headers=bearer(audience="https://other.example"))
    body = await _assert_rejected(response, "INVALID_TOKEN")
    assert "audience" in body["message"].lower()


@pytest.mark.parametrize("missing", ["issuer", "audience", "sub"])
async def test_required_claims_must_be_present(
    pclient: httpx.AsyncClient, bearer: Callable[..., dict], missing: str
) -> None:
    kwargs: dict[str, Any] = {"issuer": None} if missing == "issuer" else {}
    if missing == "audience":
        kwargs = {"audience": None}
    if missing == "sub":
        kwargs = {"sub": None}
    await _assert_rejected(await pclient.get("/_whoami", headers=bearer(**kwargs)), "INVALID_TOKEN")


async def test_token_signed_by_another_key(
    pclient: httpx.AsyncClient, bearer: Callable[..., dict]
) -> None:
    attacker = Ed25519PrivateKey.generate()
    response = await pclient.get("/_whoami", headers=bearer(key=attacker))
    await _assert_rejected(response, "INVALID_TOKEN")


async def test_unknown_key_id(pclient: httpx.AsyncClient, bearer: Callable[..., dict]) -> None:
    await _assert_rejected(await pclient.get("/_whoami", headers=bearer(kid="rotated-away")), "INVALID_TOKEN")


async def test_hs256_forged_with_public_key_is_rejected(
    pclient: httpx.AsyncClient, bearer: Callable[..., dict]
) -> None:
    # Algorithm-confusion attempt: HS256 token signed with a known value.
    response = await pclient.get("/_whoami", headers=bearer(key="x" * 64, alg="HS256"))
    body = await _assert_rejected(response, "INVALID_TOKEN")
    assert "algorithm" in body["message"].lower()


async def test_alg_none_is_rejected(pclient: httpx.AsyncClient) -> None:
    token = jwt.encode(
        {"sub": "user-1", "iss": "https://auth.test", "aud": "https://auth.test", "exp": 9999999999},
        key=None,
        algorithm="none",
    )
    await _assert_rejected(
        await pclient.get("/_whoami", headers={"Authorization": f"Bearer {token}"}), "INVALID_TOKEN"
    )


async def test_audience_defaults_to_issuer_but_can_be_overridden(
    make_settings: Callable[..., Any], app: FastAPI, bearer: Callable[..., dict]
) -> None:
    custom = make_settings(auth_audience="resumatch-api")
    app.dependency_overrides[get_settings] = lambda: custom

    @app.get("/_whoami2")
    async def whoami(user_id: Annotated[str, Depends(current_user)]) -> dict[str, str]:
        return {"user_id": user_id}

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        assert (await http.get("/_whoami2", headers=bearer(audience="resumatch-api"))).status_code == 200
        await _assert_rejected(await http.get("/_whoami2", headers=bearer()), "INVALID_TOKEN")


# ── Internal (service-to-service) key ───────────────────────────────────────


async def test_internal_key_accepts_correct_key(pclient: httpx.AsyncClient) -> None:
    response = await pclient.get("/_internal", headers={"X-Internal-Key": "test-internal-key"})
    assert response.status_code == 200


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "wrong"}])
async def test_internal_key_rejects_missing_or_wrong(
    pclient: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    await _assert_rejected(await pclient.get("/_internal", headers=headers), "FORBIDDEN", 403)


async def test_internal_api_disabled_without_configured_key(
    make_settings: Callable[..., Any], app: FastAPI
) -> None:
    app.dependency_overrides[get_settings] = lambda: make_settings(internal_api_key="")

    @app.get("/_internal2", dependencies=[Depends(require_internal_key)])
    async def internal() -> dict[str, bool]:
        return {"ok": True}

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        # An empty configured key must never be satisfiable by an empty header.
        response = await http.get("/_internal2", headers={"X-Internal-Key": ""})
        assert response.status_code == 503
        assert response.json()["code"] == "INTERNAL_API_DISABLED"


# ── JWKS fetching / caching ─────────────────────────────────────────────────


def _jwks_document(*keys: tuple[str, Ed25519PrivateKey]) -> dict[str, Any]:
    return {
        "keys": [
            {**json.loads(OKPAlgorithm.to_jwk(k.public_key())), "kid": kid, "alg": "EdDSA"}
            for kid, k in keys
        ]
    }


class _FakeJwksServer:
    def __init__(self, document: dict[str, Any] | None) -> None:
        self.document = document
        self.requests = 0
        self.fail = False

    def factory(self) -> httpx.AsyncClient:
        def handler(_: httpx.Request) -> httpx.Response:
            self.requests += 1
            if self.fail or self.document is None:
                return httpx.Response(500)
            return httpx.Response(200, json=self.document)

        return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_jwks_store_fetches_once_and_caches(signing_key: Ed25519PrivateKey) -> None:
    server = _FakeJwksServer(_jwks_document((KID, signing_key)))
    store = JWKSKeyStore("https://auth.test/jwks", 3600, 30, server.factory)
    first = await store.get_key(KID)
    second = await store.get_key(KID)
    assert server.requests == 1
    assert first is second


async def test_jwks_store_refetches_for_rotated_key_but_not_more_than_min_interval(
    signing_key: Ed25519PrivateKey,
) -> None:
    new_key = Ed25519PrivateKey.generate()
    server = _FakeJwksServer(_jwks_document((KID, signing_key)))
    store = JWKSKeyStore("https://auth.test/jwks", 3600, 0, server.factory)
    await store.get_key(KID)
    server.document = _jwks_document((KID, signing_key), ("rotated", new_key))
    assert await store.get_key("rotated") is not None
    assert server.requests == 2

    # With a long minimum interval, unknown kids cannot trigger a refetch storm.
    throttled = JWKSKeyStore("https://auth.test/jwks", 3600, 3600, server.factory)
    await throttled.get_key(KID)
    before = server.requests
    for _ in range(5):
        with pytest.raises(AppError) as info:
            await throttled.get_key("never-existed")
        assert info.value.status_code == 401
    assert server.requests == before


async def test_jwks_store_unavailable_without_cached_keys() -> None:
    server = _FakeJwksServer(None)
    store = JWKSKeyStore("https://auth.test/jwks", 3600, 0, server.factory)
    with pytest.raises(AppError) as info:
        await store.get_key(KID)
    assert info.value.status_code == 503
    assert info.value.code == "AUTH_UNAVAILABLE"


async def test_jwks_store_keeps_serving_cached_keys_when_refresh_fails(
    signing_key: Ed25519PrivateKey,
) -> None:
    server = _FakeJwksServer(_jwks_document((KID, signing_key)))
    store = JWKSKeyStore("https://auth.test/jwks", 0, 0, server.factory)  # always stale
    await store.get_key(KID)
    server.fail = True
    assert await store.get_key(KID) is not None


async def test_static_key_store_and_override_hook(signing_key: Ed25519PrivateKey) -> None:
    store = StaticKeyStore({KID: signing_key.public_key()})
    assert await store.get_key(KID) is not None
    assert await store.get_key(None) is not None  # single key: kid optional
    with pytest.raises(AppError):
        await store.get_key("other")
    # The documented injection point exists and is what the fixtures override.
    assert callable(get_key_store)
