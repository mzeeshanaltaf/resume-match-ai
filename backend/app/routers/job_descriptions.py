"""Job-description endpoints: submit by URL or text (as a job), list, read, delete."""

from __future__ import annotations

import functools
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError
from app.models import UserJd
from app.schemas import JobAccepted, JobDescriptionCreate, JobDescriptionOut
from app.services import documents
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm import get_llm
from app.services.scraping import get_firecrawl

router = APIRouter(prefix="/v1/job-descriptions", tags=["job-descriptions"])

JD_JOB_KIND = "jd_submit"


@router.post(
    "",
    status_code=202,
    response_model=JobAccepted,
    summary="Add a job description by URL or pasted text; processing runs as a job",
)
async def create_job_description(
    body: JobDescriptionCreate,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
    firecrawl: Annotated[object, Depends(get_firecrawl)],
) -> JobAccepted:
    # Inline: pasted-text length and dedup. In the job: scrape, decision gate, extraction.
    prepared = await documents.prepare_jd(session, user_id, body, settings)
    await session.close()
    work = functools.partial(
        documents.process_jd, prepared=prepared, llm=llm, firecrawl=firecrawl, settings=settings
    )
    job_id = await runner.submit(user_id=user_id, kind=JD_JOB_KIND, work=work)
    return JobAccepted(job_id=job_id)


@router.get(
    "",
    response_model=list[JobDescriptionOut],
    summary="List your job descriptions, newest first (total in X-Total-Count)",
)
async def list_job_descriptions(
    response: Response,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[JobDescriptionOut]:
    total = await session.scalar(
        select(func.count()).select_from(UserJd).where(UserJd.user_id == user_id)
    )
    rows = await session.scalars(
        select(UserJd)
        .where(UserJd.user_id == user_id)
        .order_by(UserJd.created_at.desc(), UserJd.url_id)
        .limit(limit)
        .offset(offset)
    )
    response.headers["X-Total-Count"] = str(total or 0)
    return [documents.jd_out(row) for row in rows]


async def _owned_jd(session: AsyncSession, user_id: str, jd_id: uuid.UUID) -> UserJd:
    row = await session.scalar(select(UserJd).where(UserJd.url_id == jd_id, UserJd.user_id == user_id))
    if row is None:
        raise AppError(404, "NOT_FOUND", "Job description not found.")
    return row


@router.get("/{jd_id}", response_model=JobDescriptionOut, summary="Read one job description")
async def get_job_description(
    jd_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JobDescriptionOut:
    return documents.jd_out(await _owned_jd(session, user_id, jd_id))


@router.delete("/{jd_id}", status_code=204, summary="Delete a job description")
async def delete_job_description(
    jd_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Matches that used this job description are deleted with it (foreign key cascade)."""
    row = await _owned_jd(session, user_id, jd_id)
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
