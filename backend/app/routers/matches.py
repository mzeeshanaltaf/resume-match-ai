"""Matches: run one (as a job), list, read, delete."""

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
from app.deps import AccountUser
from app.errors import AppError
from app.models import GeneratedDocument, JobMatchSummary
from app.schemas import JobAccepted, MatchCreate, MatchListItem, MatchOut
from app.services import matching, reservations
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm import get_llm

router = APIRouter(prefix="/v1/matches", tags=["matches"])


@router.post(
    "",
    status_code=202,
    response_model=JobAccepted,
    summary="Match a resume against a job description (1 credit); runs as a job",
    responses={
        402: {"description": "INSUFFICIENT_CREDITS"},
        404: {"description": "NOT_FOUND: the resume or job description is missing or not yours"},
        422: {"description": "INVALID_RESUME, INVALID_JD or MODE_MISMATCH"},
    },
)
async def create_match(
    body: MatchCreate,
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
) -> JobAccepted:
    """The candidate or recruiter prompt is chosen by the mode the resume (and job
    description) were added with. The credit is reserved before the AI call and refunded if
    the analysis fails. Job result: ``{match_id, match: MatchOut}``."""
    resume = await matching.load_owned_resume(session, user_id, body.resume_id)
    jd = await matching.load_owned_jd(session, user_id, body.jd_id)
    item = matching.build_match_input(resume, jd)
    await session.close()  # the job uses its own sessions

    cost = settings.match_credit_cost
    reservation = matching.match_reservation(item, kind_label="Match analysis", amount=cost)

    async def reserve(job_session: AsyncSession) -> None:
        await matching.reserve_all(job_session, user_id, [reservation], "match_analysis")

    work = functools.partial(matching.run_match, item=item, llm=llm)
    job_id = await runner.submit(
        user_id=user_id,
        kind=matching.MATCH_JOB_KIND,
        work=work,
        on_failure=reservations.refund_on_failure,
        meta=reservations.meta_for([reservation]),
        setup=reserve,
    )
    return JobAccepted(job_id=job_id)


@router.get(
    "",
    response_model=list[MatchListItem],
    summary="Match history, newest first (total in X-Total-Count)",
)
async def list_matches(
    response: Response,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int | None, Query(ge=1, le=500, description="Omit to return every match.")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[MatchListItem]:
    total = await session.scalar(
        select(func.count()).select_from(JobMatchSummary).where(JobMatchSummary.user_id == user_id)
    )
    query = matching.match_query(user_id).offset(offset)
    if limit is not None:
        query = query.limit(limit)
    rows = (await session.execute(query)).all()
    response.headers["X-Total-Count"] = str(total or 0)
    return [matching.match_list_item(*row) for row in rows]


@router.get("/{match_id}", response_model=MatchOut, summary="One full report with its generated documents")
async def get_match(
    match_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    row = (
        await session.execute(matching.match_query(user_id).where(JobMatchSummary.summary_id == match_id))
    ).first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Match not found.")
    match, file_name, jd_object, jd_url = row
    documents = list(
        await session.scalars(
            select(GeneratedDocument)
            .where(GeneratedDocument.match_id == match_id)
            .order_by(GeneratedDocument.created_at, GeneratedDocument.id)
        )
    )
    return matching.match_out(match, file_name, {"jd_object": jd_object, "jd_url": jd_url}, documents)


@router.delete("/{match_id}", status_code=204, summary="Delete one match (the resume and job stay)")
async def delete_match(
    match_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Deletes only the match and the documents generated for it. The resume and the job
    description it used are not touched (the n8n version deleted all three)."""
    row = await session.scalar(
        select(JobMatchSummary).where(
            JobMatchSummary.summary_id == match_id, JobMatchSummary.user_id == user_id
        )
    )
    if row is None:
        raise AppError(404, "NOT_FOUND", "Match not found.")
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
