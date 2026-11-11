"""Async SQLAlchemy engine and session dependency.

The engine's connections run with ``search_path=resume_match`` (models.SCHEMA), the
same as the Better Auth pool, so unqualified names resolve inside the app schema.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings, get_settings
from app.models import SCHEMA


def build_engine(settings: Settings, **kwargs: object) -> AsyncEngine:
    options: dict[str, object] = {"pool_pre_ping": True}
    if "poolclass" not in kwargs:  # pool sizing is invalid with e.g. NullPool (tests)
        options["pool_size"] = settings.db_pool_size
        options["max_overflow"] = settings.db_max_overflow
    options.update(kwargs)
    return create_async_engine(
        settings.async_database_url,
        connect_args={"server_settings": {"search_path": SCHEMA}},
        **options,
    )


@lru_cache
def get_engine() -> AsyncEngine:
    return build_engine(get_settings())


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request.

    Callers commit explicitly; an uncommitted session is rolled back on exit.
    """
    async with get_sessionmaker()() as session:
        yield session


async def dispose_engine() -> None:
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
    get_sessionmaker.cache_clear()
    get_engine.cache_clear()
