from __future__ import annotations

import asyncio
import os
import re
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import asyncpg
import httpx
import jwt
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.auth import StaticKeyStore, get_key_store
from app.config import Settings, get_settings
from app.db import build_engine, get_session
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://resumatch:resumatch@127.0.0.1:5433/resumatch_test"
)

ISSUER = "https://auth.test"
KID = "test-key"


# ── Settings ────────────────────────────────────────────────────────────────


@pytest.fixture
def make_settings(tmp_path: Path) -> Callable[..., Settings]:
    def _make(**overrides: Any) -> Settings:
        values: dict[str, Any] = {
            "environment": "test",
            "database_url": TEST_DB_URL,
            "auth_issuer": ISSUER,
            "auth_jwks_url": f"{ISSUER}/api/auth/jwks",
            "auth_jwks_min_refresh_seconds": 0,
            "cors_origins": ["https://app.test"],
            "internal_api_key": "test-internal-key",
            "email_hash_salt": "test-salt",
            "storage_backend": "local",
            "storage_local_dir": str(tmp_path / "storage"),
            "storage_sweep_on_startup": False,
        }
        values.update(overrides)
        return Settings(_env_file=None, **values)

    return _make


@pytest.fixture
def settings(make_settings: Callable[..., Settings]) -> Settings:
    return make_settings()


# ── JWT helpers ─────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def signing_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


@pytest.fixture
def make_token(signing_key: Ed25519PrivateKey) -> Callable[..., str]:
    def _make(
        sub: str | None = "user-1",
        *,
        key: Any = None,
        kid: str | None = KID,
        alg: str = "EdDSA",
        issuer: str | None = ISSUER,
        audience: str | None = ISSUER,
        expires_in: int = 300,
        **extra: Any,
    ) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {"iat": now, "exp": now + expires_in, **extra}
        if sub is not None:
            claims["sub"] = sub
        if issuer is not None:
            claims["iss"] = issuer
        if audience is not None:
            claims["aud"] = audience
        headers = {"kid": kid} if kid else {}
        return jwt.encode(claims, key or signing_key, algorithm=alg, headers=headers)

    return _make


@pytest.fixture
def bearer(make_token: Callable[..., str]) -> Callable[..., dict[str, str]]:
    def _bearer(**kwargs: Any) -> dict[str, str]:
        return {"Authorization": f"Bearer {make_token(**kwargs)}"}

    return _bearer


# ── App / client ────────────────────────────────────────────────────────────


@pytest.fixture
def app(settings: Settings, signing_key: Ed25519PrivateKey) -> FastAPI:
    application = create_app(settings)
    application.dependency_overrides[get_settings] = lambda: settings
    # Fake key set injected in place of the remote JWKS.
    application.dependency_overrides[get_key_store] = lambda: StaticKeyStore(
        {KID: signing_key.public_key()}
    )
    return application


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


# ── Database (requires the local dev Postgres: docker compose -f docker-compose.dev.yml up -d) ──


def _assert_safe_test_db(url: str) -> None:
    """These fixtures DROP the resume_match schema, so refuse anything but a local *test* DB."""
    match = re.match(r"^postgres(?:ql)?(?:\+\w+)?://[^@]*@([^:/]+)(?::\d+)?/([^?]+)", url)
    if not match:
        raise pytest.UsageError("TEST_DATABASE_URL is not a recognisable Postgres URL")
    host, database = match.groups()
    if os.environ.get("ALLOW_REMOTE_TEST_DB") == "1":
        return
    if host not in ("127.0.0.1", "localhost", "::1") or "test" not in database:
        raise pytest.UsageError(
            f"Refusing to run destructive DB tests against host={host!r} db={database!r}. "
            "Use a local database whose name contains 'test'."
        )


def _raw_dsn(url: str) -> str:
    return re.sub(r"^postgres(ql)?(\+\w+)?://", "postgresql://", url).split("?")[0]


@pytest.fixture(scope="session")
def migrated_db_url() -> str:
    """A freshly migrated (alembic upgrade head) local test database."""
    _assert_safe_test_db(TEST_DB_URL)

    async def _reset() -> None:
        conn = await asyncpg.connect(_raw_dsn(TEST_DB_URL), timeout=5)
        try:
            await conn.execute("DROP SCHEMA IF EXISTS resume_match CASCADE")
        finally:
            await conn.close()

    try:
        asyncio.run(_reset())
    except (OSError, asyncpg.PostgresError, asyncio.TimeoutError) as exc:
        message = (
            f"Test Postgres unreachable ({exc.__class__.__name__}). "
            "Start it with: docker compose -f docker-compose.dev.yml up -d"
        )
        if os.environ.get("REQUIRE_DB_TESTS") == "1":
            pytest.fail(message)
        pytest.skip(message)

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["url"] = TEST_DB_URL
    command.upgrade(config, "head")
    return TEST_DB_URL


@pytest_asyncio.fixture
async def engine(migrated_db_url: str) -> AsyncIterator[AsyncEngine]:
    eng = build_engine(Settings(_env_file=None, database_url=migrated_db_url), poolclass=NullPool)
    async with eng.begin() as conn:  # start every test from empty app tables
        await conn.execute(
            text(
                "TRUNCATE resume_match.generated_documents, resume_match.jobs, "
                "resume_match.deleted_accounts, resume_match.job_match_summary, "
                "resume_match.user_resume, resume_match.user_jds, "
                "resume_match.user_credit_transactions, resume_match.user_credit_accounts"
            )
        )
    yield eng
    await eng.dispose()


@pytest.fixture
def sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def session(sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as s:
        yield s


@pytest.fixture
def db_app(app: FastAPI, sessionmaker: async_sessionmaker[AsyncSession]) -> FastAPI:
    """The app wired to the test database."""

    async def _session() -> AsyncIterator[AsyncSession]:
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_session] = _session
    return app


@pytest_asyncio.fixture
async def db_client(db_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=db_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
