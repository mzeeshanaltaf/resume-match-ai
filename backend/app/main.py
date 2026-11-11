"""FastAPI app factory."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.db import dispose_engine, get_sessionmaker
from app.errors import register_exception_handlers
from app.openapi import install_extra_schemas
from app.routers import (
    account,
    credits,
    documents,
    internal,
    job_descriptions,
    jobs,
    matches,
    overview,
    resumes,
    screenings,
)
from app.services.jobs import JobRunner
from app.services.runner import build_runner
from app.services.storage import get_storage, sweep_orphaned_objects

logger = logging.getLogger(__name__)


async def _run_storage_sweep(settings: Settings) -> None:
    try:
        removed = await sweep_orphaned_objects(
            get_storage(),
            get_sessionmaker(),
            min_age_seconds=settings.storage_sweep_min_age_seconds,
        )
        logger.info("Storage sweep finished: %d orphaned object(s) removed", removed)
    except Exception:  # never let housekeeping take the service down
        logger.exception("Storage sweep failed")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper())

    # In-process job runner (single container, single worker). Tests replace
    # ``app.state.job_runner`` with one bound to the test database.
    # The runner refunds credit-spending jobs a crashed process left behind (recovery handlers).
    job_runner = build_runner(get_sessionmaker, settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        runner: JobRunner = app.state.job_runner
        try:
            # Jobs a previous process left queued/running can never finish: fail them
            # (and run their recovery handlers, e.g. refunds) before serving.
            await runner.recover_interrupted()
        except Exception:  # a database blip at boot must not stop the service starting
            logger.exception("Could not recover interrupted jobs")
        sweep_task: asyncio.Task[None] | None = None
        if settings.storage_sweep_on_startup:
            sweep_task = asyncio.create_task(_run_storage_sweep(settings))
        try:
            yield
        finally:
            if sweep_task and not sweep_task.done():
                sweep_task.cancel()
            await runner.shutdown()
            await dispose_engine()

    app = FastAPI(
        title="ResuMatchAI API",
        version="0.1.0",
        lifespan=lifespan,
        # No public interactive docs in production.
        docs_url=None if settings.environment == "prod" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "prod" else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,  # the frontend origin(s) only
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        # Headers the browser client must be able to read: the filename of a download,
        # the list totals, and the wait before a rate-limited export can be retried.
        expose_headers=["Content-Disposition", "X-Total-Count", "Retry-After"],
        max_age=600,
    )
    app.state.job_runner = job_runner
    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        # Liveness only: a database blip must not make the orchestrator restart us.
        return {"status": "ok"}

    app.include_router(resumes.router)
    app.include_router(job_descriptions.router)
    app.include_router(matches.router)
    app.include_router(documents.router)
    app.include_router(screenings.router)
    app.include_router(jobs.router)
    app.include_router(overview.router)
    app.include_router(credits.router)
    app.include_router(account.router)
    app.include_router(internal.router)
    install_extra_schemas(app)
    return app


app = create_app()
