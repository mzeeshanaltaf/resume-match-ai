"""In-process background jobs with persisted state and a live event stream.

A job is an asyncio task (the service runs as one container with one worker) whose state
lives in the ``jobs`` table: ``queued -> running -> succeeded | failed``, a ``steps`` list
(``[{name, label, status, started_at, finished_at}]``), a ``result`` on success and an
``error`` (``{code, message, details}``, the same shape as API errors) on failure.

Live progress: every step change and the final outcome is published to an in-memory
channel that ``GET /v1/jobs/{id}/events`` streams as Server-Sent Events. A channel keeps
its full history, so a client that connects late (or reconnects) replays everything and
then follows live; after ``JOB_CHANNEL_RETENTION_SECONDS`` the channel is dropped and the
same events are rebuilt from the row.

Failure hook (used by phase 3 to refund credits): ``on_failure(session, ctx, error)`` runs
in the **same transaction** that marks the job failed, so "failed" and "refunded" cannot
disagree, and it runs exactly once per failed job. Jobs left ``queued``/``running`` by a
crash or restart are marked failed at startup (:meth:`JobRunner.recover_interrupted`),
with a per-kind recovery handler for the same purpose.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.errors import AppError
from app.models import Job

logger = logging.getLogger(__name__)

WorkFn = Callable[["JobContext"], Awaitable[dict[str, Any] | None]]
FailureHook = Callable[[AsyncSession, "JobContext", dict[str, Any]], Awaitable[None]]
RecoveryHandler = Callable[[AsyncSession, Job], Awaitable[None]]
SessionMakerProvider = Callable[[], async_sessionmaker[AsyncSession]]

Event = tuple[str, dict[str, Any]]  # (event name, JSON-able data)

_INTERRUPTED = {
    "code": "JOB_INTERRUPTED",
    "message": "The job was interrupted. Please try again.",
    "details": None,
}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def error_payload(exc: AppError) -> dict[str, Any]:
    return {"code": exc.code, "message": exc.message, "details": jsonable_encoder(exc.details)}


class _Channel:
    """Append-only event history plus a wake-up for followers."""

    def __init__(self) -> None:
        self.events: list[Event] = []
        self.closed = False
        self._wakeup = asyncio.Event()

    def _wake(self) -> None:
        old, self._wakeup = self._wakeup, asyncio.Event()
        old.set()

    def publish(self, name: str, data: dict[str, Any]) -> None:
        self.events.append((name, data))
        self._wake()

    def close(self) -> None:
        self.closed = True
        self._wake()

    async def follow(self, heartbeat_seconds: float) -> AsyncIterator[Event | None]:
        """Yield every event (history first), ``None`` as a keep-alive when idle."""
        index = 0
        while True:
            while index < len(self.events):
                yield self.events[index]
                index += 1
            if self.closed:
                return
            waiter = self._wakeup  # no await between the checks above and this capture
            try:
                await asyncio.wait_for(waiter.wait(), timeout=heartbeat_seconds)
            except TimeoutError:
                yield None


class JobContext:
    """Handed to a job's work function: its identity, DB access and progress reporting."""

    def __init__(self, runner: JobRunner, job_id: uuid.UUID, user_id: str, kind: str) -> None:
        self._runner = runner
        self.id = job_id
        self.user_id = user_id
        self.kind = kind
        self.steps: list[dict[str, Any]] = []

    @property
    def sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        return self._runner.sessionmaker

    async def _persist_steps(self) -> None:
        async with self.sessionmaker() as session:
            await session.execute(
                update(Job).where(Job.id == self.id).values(steps=copy.deepcopy(self.steps))
            )
            await session.commit()

    async def _report(self, entry: dict[str, Any]) -> None:
        try:
            await self._persist_steps()
        except Exception:  # progress is best-effort; never fail a job over it
            logger.exception("Could not persist steps for job %s", self.id)
        self._runner.publish(self.id, "step", copy.deepcopy(entry))

    @asynccontextmanager
    async def step(self, name: str, label: str | None = None) -> AsyncIterator[None]:
        """Mark a step running, then ``done`` (or ``failed`` if the body raises)."""
        entry: dict[str, Any] = {
            "name": name,
            "label": label,
            "status": "running",
            "started_at": _now_iso(),
            "finished_at": None,
        }
        self.steps.append(entry)
        await self._report(entry)
        try:
            yield
        except BaseException:
            entry.update(status="failed", finished_at=_now_iso())
            await self._report(entry)
            raise
        entry.update(status="done", finished_at=_now_iso())
        await self._report(entry)


class JobRunner:
    def __init__(self, sessionmaker_provider: SessionMakerProvider, settings: Settings) -> None:
        self._provider = sessionmaker_provider
        self._settings = settings
        self._channels: dict[uuid.UUID, _Channel] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._recovery: dict[str, RecoveryHandler] = {}

    @property
    def sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        return self._provider()

    # ── submitting ──────────────────────────────────────────────────────────

    async def submit(
        self,
        *,
        user_id: str,
        kind: str,
        work: WorkFn,
        on_failure: FailureHook | None = None,
    ) -> uuid.UUID:
        """Create the job row, start the task, return the id immediately."""
        job_id = uuid.uuid4()
        async with self.sessionmaker() as session:
            session.add(Job(id=job_id, user_id=user_id, kind=kind, status="queued", steps=[]))
            await session.commit()

        self._channels[job_id] = _Channel()
        ctx = JobContext(self, job_id, user_id, kind)
        task = asyncio.create_task(self._run(ctx, work, on_failure), name=f"job-{kind}-{job_id}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job_id

    def publish(self, job_id: uuid.UUID, name: str, data: dict[str, Any]) -> None:
        channel = self._channels.get(job_id)
        if channel is not None:
            channel.publish(name, {"job_id": str(job_id), **data})

    async def _run(self, ctx: JobContext, work: WorkFn, on_failure: FailureHook | None) -> None:
        error: dict[str, Any] | None = None
        cancelled = False
        try:
            await self._set_running(ctx)
            result = await work(ctx)
        except asyncio.CancelledError:
            error, cancelled = dict(_INTERRUPTED), True
        except AppError as exc:
            error = error_payload(exc)
        except Exception:
            logger.exception("Job %s (%s) crashed", ctx.id, ctx.kind)
            error = {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side.", "details": None}
        else:
            try:
                await self._finish_ok(ctx, result)
            except Exception:
                logger.exception("Could not record success of job %s", ctx.id)
                error = {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side.", "details": None}

        if error is not None:
            await self._finish_failed(ctx, error, on_failure)
        self._close_channel(ctx.id)
        if cancelled:
            raise asyncio.CancelledError

    async def _set_running(self, ctx: JobContext) -> None:
        async with self.sessionmaker() as session:
            await session.execute(update(Job).where(Job.id == ctx.id).values(status="running"))
            await session.commit()

    async def _finish_ok(self, ctx: JobContext, result: dict[str, Any] | None) -> None:
        encoded = jsonable_encoder(result) if result is not None else None
        async with self.sessionmaker() as session:
            await session.execute(
                update(Job)
                .where(Job.id == ctx.id)
                .values(status="succeeded", result=encoded, error=None, finished_at=func.now())
            )
            await session.commit()
        self.publish(ctx.id, "succeeded", {"result": encoded})

    async def _finish_failed(
        self, ctx: JobContext, error: dict[str, Any], on_failure: FailureHook | None
    ) -> None:
        try:
            async with self.sessionmaker() as session:
                if on_failure is not None:
                    try:
                        await on_failure(session, ctx, error)
                    except Exception:
                        logger.exception("Failure hook for job %s raised; continuing", ctx.id)
                        await session.rollback()
                await session.execute(
                    update(Job)
                    .where(Job.id == ctx.id)
                    .values(
                        status="failed",
                        error=error,
                        steps=copy.deepcopy(ctx.steps),
                        finished_at=func.now(),
                    )
                )
                await session.commit()
        except Exception:
            logger.exception("Could not record failure of job %s", ctx.id)
        self.publish(ctx.id, "failed", {"error": error})

    def _close_channel(self, job_id: uuid.UUID) -> None:
        channel = self._channels.get(job_id)
        if channel is None:
            return
        channel.close()
        retention = self._settings.job_channel_retention_seconds
        asyncio.get_running_loop().call_later(retention, self._channels.pop, job_id, None)

    # ── streaming ───────────────────────────────────────────────────────────

    async def events(self, job: Job) -> AsyncIterator[Event | None]:
        """Events for ``job`` (already authorised by the caller): history, then live."""
        channel = self._channels.get(job.id)
        if channel is not None:
            async for item in channel.follow(self._settings.sse_heartbeat_seconds):
                yield item
            return
        for event in events_from_row(job):  # channel expired (or another process ran it)
            yield event

    # ── waiting / lifecycle ─────────────────────────────────────────────────

    async def wait_idle(self) -> None:
        """Wait for every running job to finish (tests and graceful shutdown)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def shutdown(self) -> None:
        """Cancel running jobs; each marks itself failed (and runs its failure hook)."""
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def register_recovery(self, kind: str, handler: RecoveryHandler) -> None:
        """Run ``handler(session, job)`` for each interrupted job of ``kind`` at startup,
        in the transaction that marks it failed (phase 3: refund the reservation)."""
        self._recovery[kind] = handler

    async def recover_interrupted(self) -> int:
        """Mark jobs left queued/running by a previous process as failed. Run at startup,
        before serving. Returns how many were recovered."""
        async with self.sessionmaker() as session:
            jobs = (
                await session.scalars(select(Job).where(Job.status.in_(("queued", "running"))))
            ).all()
            for job in jobs:
                handler = self._recovery.get(job.kind)
                if handler is not None:
                    try:
                        await handler(session, job)
                    except Exception:
                        logger.exception("Recovery handler failed for job %s", job.id)
                job.steps = [
                    {**step, "status": "failed"} if step.get("status") == "running" else step
                    for step in job.steps
                ]
                job.status = "failed"
                job.error = dict(_INTERRUPTED)
                job.finished_at = datetime.now(UTC)
            await session.commit()
        if jobs:
            logger.warning("Marked %d interrupted job(s) as failed", len(jobs))
        return len(jobs)


def events_from_row(job: Job) -> list[Event]:
    """Rebuild a finished job's event history from its row (no live channel)."""
    base = {"job_id": str(job.id)}
    events: list[Event] = [("step", {**base, **step}) for step in job.steps]
    if job.status == "succeeded":
        events.append(("succeeded", {**base, "result": job.result}))
    elif job.status == "failed":
        events.append(("failed", {**base, "error": job.error}))
    return events


async def load_job(session: AsyncSession, user_id: str, job_id: uuid.UUID) -> Job:
    """The caller's job, or 404 (another user's job is indistinguishable from a missing one)."""
    job = await session.scalar(select(Job).where(Job.id == job_id, Job.user_id == user_id))
    if job is None:
        raise AppError(404, "NOT_FOUND", "Job not found.")
    return job


def get_job_runner(request: Request) -> JobRunner:
    """FastAPI dependency: the runner created in ``create_app``."""
    return request.app.state.job_runner  # type: ignore[no-any-return]
