"""Job snapshot and the live event stream (Server-Sent Events).

SSE wire format (the phase 4 frontend client depends on this)::

    id: 1
    event: step
    data: {"job_id": "...", "name": "parsing", "label": "Reading your file",
           "status": "running", "started_at": "...", "finished_at": null}

    id: 2
    event: step            # same step again with status "done" (or "failed")
    data: {...}

    id: 7
    event: succeeded       # terminal; the stream then closes
    data: {"job_id": "...", "result": {...}}

    event: failed          # terminal; the stream then closes
    data: {"job_id": "...", "error": {"code": "...", "message": "...", "details": ...}}

    : keepalive            # comment line every SSE_HEARTBEAT_SECONDS while idle

A late or reconnecting client receives the full history first, so it never needs a
separate snapshot call (``GET /v1/jobs/{id}`` exists for polling and one-off reads).
The browser's ``EventSource`` cannot send an ``Authorization`` header, so clients read the
stream with ``fetch``.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.schemas import JobOut
from app.services.jobs import JobRunner, get_job_runner, load_job

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


def format_sse(event: str, data: dict[str, Any], event_id: int) -> str:
    payload = json.dumps(jsonable_encoder(data), separators=(",", ":"))
    return f"id: {event_id}\nevent: {event}\ndata: {payload}\n\n"


KEEPALIVE = ": keepalive\n\n"


@router.get("/{job_id}", response_model=JobOut, summary="Job snapshot")
async def get_job(
    job_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JobOut:
    return JobOut.model_validate(await load_job(session, user_id, job_id), from_attributes=True)


@router.get("/{job_id}/events", summary="Live progress as Server-Sent Events")
async def job_events(
    job_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
) -> StreamingResponse:
    job = await load_job(session, user_id, job_id)  # 404 before any streaming starts
    await session.close()  # a stream can last minutes: do not hold a DB connection

    async def stream() -> AsyncIterator[str]:
        event_id = 0
        async for item in runner.events(job):
            if item is None:
                yield KEEPALIVE
                continue
            event_id += 1
            yield format_sse(item[0], item[1], event_id)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # tell nginx-style proxies not to buffer
        },
    )
