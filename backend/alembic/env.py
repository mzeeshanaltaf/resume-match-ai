"""Alembic environment (async, asyncpg).

* The URL comes from ``config.attributes["url"]`` (tests) or ``DATABASE_URL``.
* The version table lives inside ``resume_match`` next to the app tables.
* Only tables declared in ``app.models`` are managed; Better Auth's tables (``user``,
  ``session``, ``account``, ``verification``, ``jwks``) share the schema and are left
  strictly alone.
"""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings, normalise_async_database_url
from app.models import SCHEMA, Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    override = config.attributes.get("url")
    return normalise_async_database_url(override) if override else get_settings().async_database_url


def _include_object(obj: object, name: str | None, type_: str, reflected: bool, compare_to: object) -> bool:
    # Never let autogenerate/compare propose changes to tables we do not model.
    if type_ == "table" and reflected:
        return name in {table.name for table in target_metadata.tables.values()}
    return True


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_object=_include_object,
    )


def _do_run(connection: Connection) -> None:
    # The schema must exist before the version table can be created inside it.
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
    connection.execute(text(f'SET search_path TO "{SCHEMA}"'))
    connection.commit()
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    engine = create_async_engine(_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_do_run)
    await engine.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        version_table_schema=SCHEMA,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(_run_async())
