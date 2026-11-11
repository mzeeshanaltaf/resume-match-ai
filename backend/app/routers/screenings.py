"""Screenings: score many resumes against one job (recruiter mode) as a single job."""

from __future__ import annotations

import functools
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.deps import AccountUser
from app.errors import AppError
from app.models import UserResume
from app.schemas import JobAccepted, ScreeningCreate
from app.services import matching, reservations
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm import get_llm

router = APIRouter(prefix="/v1/screenings", tags=["screenings"])


@router.post(
    "",
    status_code=202,
    response_model=JobAccepted,
    summary="Screen up to MAX_SCREENING_RESUMES resumes against one job (1 credit each); runs as a job",
    responses={
        402: {"description": "INSUFFICIENT_CREDITS (details.needed is the total for the batch)"},
        404: {"description": "NOT_FOUND: a resume or the job description is missing or not yours"},
        422: {"description": "TOO_MANY_RESUMES, INVALID_RESUME, INVALID_JD or MODE_MISMATCH"},
    },
)
async def create_screening(
    body: ScreeningCreate,
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
) -> JobAccepted:
    """Recruiter mode only. Credits for the whole batch are reserved up front (all or
    nothing); each resume that fails is refunded individually and listed in ``failed``.
    One step per resume (``score:<resume_id>``) streams progress. Job result:
    ``ScreeningResult`` (ranked best first)."""
    if len(body.resume_ids) > settings.max_screening_resumes:
        raise AppError(
            422,
            "TOO_MANY_RESUMES",
            f"You can screen up to {settings.max_screening_resumes} resumes at a time.",
            {"max_resumes": settings.max_screening_resumes, "received": len(body.resume_ids)},
        )

    jd = await matching.load_owned_jd(session, user_id, body.jd_id)
    rows = {
        row.file_id: row
        for row in await session.scalars(
            select(UserResume).where(UserResume.user_id == user_id, UserResume.file_id.in_(body.resume_ids))
        )
    }
    missing = [str(resume_id) for resume_id in body.resume_ids if resume_id not in rows]
    if missing:
        raise AppError(404, "NOT_FOUND", "Some resumes were not found.", {"resume_ids": missing})
    # Keep the order the caller sent: it is the tie-break when scores are equal.
    items = [matching.build_match_input(rows[resume_id], jd, require_mode="recruiter") for resume_id in body.resume_ids]
    await session.close()

    per_resume = settings.screening_credit_cost_per_resume
    entries = [matching.match_reservation(item, kind_label="Screening", amount=per_resume) for item in items]

    async def reserve(job_session: AsyncSession) -> None:
        await matching.reserve_all(job_session, user_id, entries, "screening")

    work = functools.partial(matching.run_screening, jd_id=body.jd_id, items=items, llm=llm, settings=settings)
    job_id = await runner.submit(
        user_id=user_id,
        kind=matching.SCREENING_JOB_KIND,
        work=work,
        on_failure=reservations.refund_on_failure,
        meta=reservations.meta_for(entries),
        setup=reserve,
    )
    return JobAccepted(job_id=job_id)
