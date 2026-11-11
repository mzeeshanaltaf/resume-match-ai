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
from app.routers import job_descriptions, jobs, me, resumes
from app.services.jobs import JobRunner
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
    job_runner = JobRunner(get_sessionmaker, settings)

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
        expose_headers=["Content-Disposition"],
        max_age=600,
    )
    app.state.job_runner = job_runner
    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        # Liveness only: a database blip must not make the orchestrator restart us.
        return {"status": "ok"}

    app.include_router(me.router)
    app.include_router(resumes.router)
    app.include_router(job_descriptions.router)
    app.include_router(jobs.router)
    return app


app = create_app()
