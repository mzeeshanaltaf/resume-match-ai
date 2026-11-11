from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.errors import AppError
from app.models import Job
from app.services.jobs import JobContext, JobRunner, events_from_row, load_job


@pytest.fixture
def runner(sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> JobRunner:
    return JobRunner(lambda: sessionmaker, settings)


async def _row(sessionmaker: async_sessionmaker[AsyncSession], job_id: uuid.UUID) -> Job:
    async with sessionmaker() as session:
        return (await session.scalars(select(Job).where(Job.id == job_id))).one()


async def _collect(runner: JobRunner, job: Job) -> list[tuple[str, dict[str, Any]]]:
    return [item async for item in runner.events(job) if item is not None]


async def test_lifecycle_queued_running_succeeded(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    started, release = asyncio.Event(), asyncio.Event()

    async def work(ctx: JobContext) -> dict[str, Any]:
        async with ctx.step("parsing", "Reading"):
            started.set()
            await release.wait()
        async with ctx.step("saving"):
            pass
        return {"resume_id": uuid.UUID(int=1)}  # UUIDs must be JSON-encoded

    job_id = await runner.submit(user_id="u1", kind="resume_upload", work=work)
    assert (await _row(sessionmaker, job_id)).status in ("queued", "running")

    await started.wait()
    mid = await _row(sessionmaker, job_id)
    assert mid.status == "running" and mid.finished_at is None
    assert [(s["name"], s["status"]) for s in mid.steps] == [("parsing", "running")]

    release.set()
    await runner.wait_idle()
    done = await _row(sessionmaker, job_id)
    assert done.status == "succeeded" and done.error is None and done.finished_at is not None
    assert done.result == {"resume_id": str(uuid.UUID(int=1))}
    assert [(s["name"], s["status"]) for s in done.steps] == [("parsing", "done"), ("saving", "done")]
    assert done.steps[0]["label"] == "Reading" and done.steps[0]["finished_at"]


async def test_app_error_fails_the_job_with_the_api_error_shape(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    async def work(ctx: JobContext) -> None:
        async with ctx.step("validating"):
            raise AppError(422, "INVALID_RESUME", "Not a resume.", {"probability": 0.1})

    job_id = await runner.submit(user_id="u1", kind="resume_upload", work=work)
    await runner.wait_idle()
    row = await _row(sessionmaker, job_id)
    assert row.status == "failed" and row.result is None and row.finished_at is not None
    assert row.error == {"code": "INVALID_RESUME", "message": "Not a resume.", "details": {"probability": 0.1}}
    assert [(s["name"], s["status"]) for s in row.steps] == [("validating", "failed")]


async def test_unexpected_exception_is_generic_and_not_leaked(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    async def work(ctx: JobContext) -> None:
        raise RuntimeError("secret connection string")

    job_id = await runner.submit(user_id="u1", kind="x", work=work)
    await runner.wait_idle()
    row = await _row(sessionmaker, job_id)
    assert row.status == "failed" and row.error["code"] == "INTERNAL_ERROR"
    assert "secret" not in str(row.error)


async def test_failure_hook_runs_once_in_the_same_transaction(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    calls: list[tuple[str, str]] = []

    async def hook(session: AsyncSession, ctx: JobContext, error: dict[str, Any]) -> None:
        calls.append((ctx.user_id, error["code"]))
        # Uncommitted at this point: the runner's single commit covers hook + status.
        other = await session.scalar(select(Job.status).where(Job.id == ctx.id))
        assert other == "running"

    async def boom(ctx: JobContext) -> None:
        raise AppError(402, "INSUFFICIENT_CREDITS", "no")

    async def fine(ctx: JobContext) -> dict[str, Any]:
        return {}

    await runner.submit(user_id="u1", kind="match", work=boom, on_failure=hook)
    await runner.submit(user_id="u2", kind="match", work=fine, on_failure=hook)
    await runner.wait_idle()
    assert calls == [("u1", "INSUFFICIENT_CREDITS")]  # once, and not for the success


async def test_a_raising_hook_still_marks_the_job_failed(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    async def hook(session: AsyncSession, ctx: JobContext, error: dict[str, Any]) -> None:
        raise RuntimeError("refund exploded")

    async def boom(ctx: JobContext) -> None:
        raise AppError(500, "X", "x")

    job_id = await runner.submit(user_id="u1", kind="match", work=boom, on_failure=hook)
    await runner.wait_idle()
    assert (await _row(sessionmaker, job_id)).status == "failed"


async def test_shutdown_interrupts_running_jobs_and_runs_the_hook(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    hooked: list[str] = []
    started = asyncio.Event()

    async def hook(session: AsyncSession, ctx: JobContext, error: dict[str, Any]) -> None:
        hooked.append(error["code"])

    async def work(ctx: JobContext) -> None:
        async with ctx.step("analyzing"):
            started.set()
            await asyncio.sleep(60)

    job_id = await runner.submit(user_id="u1", kind="match", work=work, on_failure=hook)
    await started.wait()
    await runner.shutdown()
    row = await _row(sessionmaker, job_id)
    assert row.status == "failed" and row.error["code"] == "JOB_INTERRUPTED"
    assert hooked == ["JOB_INTERRUPTED"]


async def test_recover_interrupted_marks_leftovers_failed(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    ids = {name: uuid.uuid4() for name in ("running", "queued", "succeeded", "failed")}
    async with sessionmaker() as session:
        session.add_all(
            [
                Job(id=ids["running"], user_id="u1", kind="match", status="running",
                    steps=[{"name": "analyzing", "status": "running"}]),
                Job(id=ids["queued"], user_id="u1", kind="other", status="queued", steps=[]),
                Job(id=ids["succeeded"], user_id="u1", kind="match", status="succeeded", steps=[]),
                Job(id=ids["failed"], user_id="u1", kind="match", status="failed", steps=[]),
            ]
        )
        await session.commit()

    recovered: list[uuid.UUID] = []

    async def handler(session: AsyncSession, job: Job) -> None:
        recovered.append(job.id)

    runner.register_recovery("match", handler)
    assert await runner.recover_interrupted() == 2

    assert recovered == [ids["running"]]  # only the interrupted job of that kind
    running = await _row(sessionmaker, ids["running"])
    assert running.status == "failed" and running.error["code"] == "JOB_INTERRUPTED"
    assert running.steps[0]["status"] == "failed" and running.finished_at is not None
    assert (await _row(sessionmaker, ids["queued"])).status == "failed"
    assert (await _row(sessionmaker, ids["succeeded"])).status == "succeeded"
    assert await runner.recover_interrupted() == 0  # idempotent


async def test_events_replay_for_a_late_subscriber(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    async def work(ctx: JobContext) -> dict[str, Any]:
        async with ctx.step("parsing"):
            pass
        async with ctx.step("saving"):
            pass
        return {"ok": True}

    job_id = await runner.submit(user_id="u1", kind="x", work=work)
    await runner.wait_idle()
    job = await _row(sessionmaker, job_id)

    events = await _collect(runner, job)  # channel still in memory
    assert [(n, d.get("name"), d.get("status")) for n, d in events] == [
        ("step", "parsing", "running"),
        ("step", "parsing", "done"),
        ("step", "saving", "running"),
        ("step", "saving", "done"),
        ("succeeded", None, None),
    ]
    assert events[-1][1]["result"] == {"ok": True} and events[0][1]["job_id"] == str(job_id)

    runner._channels.clear()  # retention expired: rebuilt from the row
    rebuilt = await _collect(runner, await _row(sessionmaker, job_id))
    assert [n for n, _ in rebuilt] == ["step", "step", "succeeded"]  # final state of each step
    assert rebuilt[-1][1]["result"] == {"ok": True}


async def test_live_subscriber_sees_steps_as_they_happen_then_the_failure(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    gate = asyncio.Event()

    async def work(ctx: JobContext) -> None:
        async with ctx.step("scraping"):
            await gate.wait()
        raise AppError(422, "INVALID_JD", "Not a posting.")

    job_id = await runner.submit(user_id="u1", kind="jd_submit", work=work)
    job = await _row(sessionmaker, job_id)

    seen: list[str] = []

    async def follow() -> None:
        async for item in runner.events(job):
            if item is not None:
                seen.append(f"{item[0]}:{item[1].get('status', '')}")
                if item[0] == "step" and item[1]["status"] == "running":
                    gate.set()

    await asyncio.wait_for(follow(), timeout=5)
    assert seen == ["step:running", "step:done", "failed:"]


async def test_idle_stream_sends_keepalives(
    sessionmaker: async_sessionmaker[AsyncSession], make_settings: Any
) -> None:
    runner = JobRunner(lambda: sessionmaker, make_settings(sse_heartbeat_seconds=0.05))
    gate = asyncio.Event()

    async def work(ctx: JobContext) -> None:
        await gate.wait()

    job_id = await runner.submit(user_id="u1", kind="x", work=work)
    job = await _row(sessionmaker, job_id)
    items: list[Any] = []
    async for item in runner.events(job):
        items.append(item)
        if len(items) == 2:
            gate.set()
            break
    assert items == [None, None]
    await runner.wait_idle()


async def test_load_job_is_owner_scoped(
    runner: JobRunner, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    async def work(ctx: JobContext) -> None:
        return None

    job_id = await runner.submit(user_id="owner", kind="x", work=work)
    await runner.wait_idle()
    async with sessionmaker() as session:
        assert (await load_job(session, "owner", job_id)).id == job_id
        with pytest.raises(AppError) as exc:
            await load_job(session, "intruder", job_id)
        assert exc.value.status_code == 404
        with pytest.raises(AppError):
            await load_job(session, "owner", uuid.uuid4())


def test_events_from_row_for_a_job_without_a_channel() -> None:
    job = Job(id=uuid.uuid4(), user_id="u", kind="x", status="failed",
              steps=[{"name": "a", "status": "failed"}], error={"code": "X", "message": "m", "details": None})
    names = [n for n, _ in events_from_row(job)]
    assert names == ["step", "failed"]


async def test_app_startup_fails_leftover_jobs_and_shutdown_cancels_running_ones(
    db_app: Any, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    leftover = uuid.uuid4()
    async with sessionmaker() as session:
        session.add(Job(id=leftover, user_id="u1", kind="resume_upload", status="running", steps=[]))
        await session.commit()

    started = asyncio.Event()

    async def slow(ctx: JobContext) -> None:
        started.set()
        await asyncio.sleep(60)

    async with db_app.router.lifespan_context(db_app):  # real startup/shutdown hooks
        row = await _row(sessionmaker, leftover)
        assert row.status == "failed" and row.error["code"] == "JOB_INTERRUPTED"
        running = await db_app.state.job_runner.submit(user_id="u1", kind="x", work=slow)
        await started.wait()

    assert (await _row(sessionmaker, running)).status == "failed"  # cancelled by shutdown
