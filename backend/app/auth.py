"""Better Auth JWT verification.

The browser sends ``Authorization: Bearer <jwt>`` minted by Better Auth's ``jwt()``
plugin. We verify the signature against the JWKS the frontend publishes, check
``iss`` / ``aud`` / ``exp``, and use ``sub`` as the user id. Keys are cached; an unknown
``kid`` triggers one rate-limited refetch so key rotation needs no restart.

Tests inject a fake key set by overriding :func:`get_key_store`::

    app.dependency_overrides[get_key_store] = lambda: StaticKeyStore({"kid": public_key})
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any, Protocol

import httpx
import jwt
from fastapi import Depends, Header
from jwt.algorithms import OKPAlgorithm, RSAAlgorithm

from app.config import Settings, get_settings
from app.errors import AppError

logger = logging.getLogger(__name__)

_BEARER_HEADERS = {"WWW-Authenticate": "Bearer"}


def _unauthenticated(code: str, message: str) -> AppError:
    return AppError(401, code, message, headers=_BEARER_HEADERS)


# ── Key stores ──────────────────────────────────────────────────────────────


class KeyStore(Protocol):
    async def get_key(self, kid: str | None) -> Any:
        """Return the verification key for ``kid`` or raise ``AppError(401)``."""


class StaticKeyStore:
    """Fixed key set, for tests (and anything that wants to pin keys)."""

    def __init__(self, keys: dict[str, Any]) -> None:
        self._keys = keys

    async def get_key(self, kid: str | None) -> Any:
        if kid is None and len(self._keys) == 1:
            return next(iter(self._keys.values()))
        key = self._keys.get(kid or "")
        if key is None:
            raise _unauthenticated("INVALID_TOKEN", "Unknown signing key.")
        return key


def _key_from_jwk(jwk: dict[str, Any]) -> Any:
    kty = jwk.get("kty")
    if kty == "OKP":
        return OKPAlgorithm.from_jwk(jwk)
    if kty == "RSA":
        return RSAAlgorithm.from_jwk(jwk)
    raise ValueError(f"Unsupported JWK key type: {kty!r}")


class JWKSKeyStore:
    """Fetches and caches a JWKS document."""

    def __init__(
        self,
        url: str,
        cache_seconds: int,
        min_refresh_seconds: int,
        client_factory: Any = None,
    ) -> None:
        self._url = url
        self._cache_seconds = cache_seconds
        self._min_refresh_seconds = min_refresh_seconds
        self._client_factory = client_factory or (lambda: httpx.AsyncClient(timeout=10))
        self._keys: dict[str, Any] = {}
        self._fetched_at: float | None = None  # last successful fetch
        self._last_attempt: float | None = None  # last fetch attempt, successful or not
        self._lock = asyncio.Lock()

    def _fresh(self) -> bool:
        return self._fetched_at is not None and (
            time.monotonic() - self._fetched_at < self._cache_seconds
        )

    def _can_refetch(self) -> bool:
        return self._last_attempt is None or (
            time.monotonic() - self._last_attempt >= self._min_refresh_seconds
        )

    async def _refresh(self) -> None:
        """Fetch the JWKS. On failure keep any cached keys and let the caller decide."""
        self._last_attempt = time.monotonic()
        try:
            async with self._client_factory() as client:
                response = await client.get(self._url)
                response.raise_for_status()
                document = response.json()
            raw_keys = document.get("keys", [])
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            logger.warning("JWKS fetch from %s failed: %s", self._url, exc)
            return

        keys: dict[str, Any] = {}
        for jwk in raw_keys:
            try:
                keys[jwk.get("kid", "")] = _key_from_jwk(jwk)
            except (ValueError, jwt.PyJWTError) as exc:
                logger.warning("Skipping unusable JWK %s: %s", jwk.get("kid"), exc)
        self._keys = keys
        self._fetched_at = time.monotonic()

    async def get_key(self, kid: str | None) -> Any:
        async with self._lock:
            if not self._fresh() and self._can_refetch():
                await self._refresh()
            key = self._lookup(kid)
            if key is None and self._can_refetch():
                await self._refresh()  # key rotation: the kid may be new
                key = self._lookup(kid)
            if key is None and not self._keys:
                raise AppError(
                    503, "AUTH_UNAVAILABLE", "Could not load signing keys. Try again shortly."
                )
        if key is None:
            raise _unauthenticated("INVALID_TOKEN", "Unknown signing key.")
        return key

    def _lookup(self, kid: str | None) -> Any:
        if kid is None:
            return next(iter(self._keys.values())) if len(self._keys) == 1 else None
        return self._keys.get(kid)


@lru_cache
def _jwks_store(url: str, cache_seconds: int, min_refresh_seconds: int) -> JWKSKeyStore:
    return JWKSKeyStore(url, cache_seconds, min_refresh_seconds)


def get_key_store(settings: Annotated[Settings, Depends(get_settings)]) -> KeyStore:
    return _jwks_store(
        settings.auth_jwks_url,
        settings.auth_jwks_cache_seconds,
        settings.auth_jwks_min_refresh_seconds,
    )


# ── Token verification ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class AuthClaims:
    user_id: str
    email: str | None = None


async def verify_token(token: str, settings: Settings, key_store: KeyStore) -> AuthClaims:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise _unauthenticated("INVALID_TOKEN", "Malformed token.") from exc

    algorithm = header.get("alg")
    if algorithm not in settings.auth_algorithms:  # also rejects alg=none and HS* confusion
        raise _unauthenticated("INVALID_TOKEN", "Unsupported token algorithm.")

    key = await key_store.get_key(header.get("kid"))
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=settings.auth_algorithms,
            issuer=settings.auth_issuer,
            audience=settings.jwt_audience,
            leeway=settings.auth_leeway_seconds,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthenticated("TOKEN_EXPIRED", "Token has expired.") from exc
    except jwt.InvalidIssuerError as exc:
        raise _unauthenticated("INVALID_TOKEN", "Token issuer is not accepted.") from exc
    except jwt.InvalidAudienceError as exc:
        raise _unauthenticated("INVALID_TOKEN", "Token audience is not accepted.") from exc
    except jwt.PyJWTError as exc:
        raise _unauthenticated("INVALID_TOKEN", "Token could not be verified.") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthenticated("INVALID_TOKEN", "Token has no subject.")
    email = payload.get("email")
    return AuthClaims(user_id=subject, email=email if isinstance(email, str) else None)


# ── Dependencies ────────────────────────────────────────────────────────────


async def current_claims(
    settings: Annotated[Settings, Depends(get_settings)],
    key_store: Annotated[KeyStore, Depends(get_key_store)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthClaims:
    if not authorization:
        raise _unauthenticated("AUTH_REQUIRED", "Sign in to continue.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthenticated("AUTH_REQUIRED", "Expected an 'Authorization: Bearer <token>' header.")
    return await verify_token(token.strip(), settings, key_store)


async def current_user(claims: Annotated[AuthClaims, Depends(current_claims)]) -> str:
    """The authenticated user's id (the JWT ``sub``). Scope every query by this."""
    return claims.user_id


async def require_internal_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    """Service-to-service guard (``X-Internal-Key``); disabled when no key is configured."""
    configured = settings.internal_api_key
    if not configured:
        raise AppError(503, "INTERNAL_API_DISABLED", "The internal API is not configured.")
    if not x_internal_key or not hmac.compare_digest(
        x_internal_key.encode(), configured.encode()
    ):
        raise AppError(403, "FORBIDDEN", "Invalid internal key.")
