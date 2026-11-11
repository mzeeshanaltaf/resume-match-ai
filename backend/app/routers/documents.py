"""Generated documents for a match: tailored resume bullets and a cover letter (jobs)."""

from __future__ import annotations

import functools
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.deps import AccountUser
from app.errors import AppError
from app.schemas import JobAccepted
from app.services import generation, matching, reservations
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm import get_llm

router = APIRouter(prefix="/v1/matches", tags=["documents"])

_NOT_FOUND = {404: {"description": "NOT_FOUND: no such match, or it is not yours"}}
_CANDIDATE_ONLY = {422: {"description": "CANDIDATE_ONLY: recruiter screenings have no resume to tailor"}}


@router.post(
    "/{match_id}/tailored-bullets",
    status_code=202,
    response_model=JobAccepted,
    summary="Rewrite the resume's summary and bullets for this job (included in the match credit)",
    responses={
        **_NOT_FOUND,
        **_CANDIDATE_ONLY,
        409: {"description": "ALREADY_GENERATED: details.document_id holds the existing one"},
    },
)
async def create_tailored_bullets(
    match_id: uuid.UUID,
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
) -> JobAccepted:
    """Free (the match credit covers it) and available once per match. Job result:
    ``{document_id, document: GeneratedDocumentOut}``."""
    item = await generation.load_generation_input(session, user_id, match_id)
    if (existing := await generation.existing_bullets(session, match_id)) is not None:
        raise AppError(
            409,
            "ALREADY_GENERATED",
            "Tailored bullets were already generated for this match.",
            {"document_id": str(existing.id)},
        )
    await session.close()

    work = functools.partial(generation.run_tailored_bullets, item=item, llm=llm)
    job_id = await runner.submit(user_id=user_id, kind=generation.BULLETS_JOB_KIND, work=work)
    return JobAccepted(job_id=job_id)


@router.post(
    "/{match_id}/cover-letter",
    status_code=202,
    response_model=JobAccepted,
    summary="Draft a cover letter for this match (1 credit)",
    responses={
        **_NOT_FOUND,
        **_CANDIDATE_ONLY,
        402: {"description": "INSUFFICIENT_CREDITS"},
    },
)
async def create_cover_letter(
    match_id: uuid.UUID,
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
) -> JobAccepted:
    """Costs a credit each time it is generated; reserved up front, refunded on failure.
    Job result: ``{document_id, document: GeneratedDocumentOut}``."""
    item = await generation.load_generation_input(session, user_id, match_id)
    await session.close()

    document_id = uuid.uuid4()
    reservation = generation.cover_letter_reservation(item, document_id, settings.cover_letter_credit_cost)

    async def reserve(job_session: AsyncSession) -> None:
        await matching.reserve_all(job_session, user_id, [reservation], "cover_letter")

    work = functools.partial(generation.run_cover_letter, item=item, document_id=document_id, llm=llm)
    job_id = await runner.submit(
        user_id=user_id,
        kind=generation.COVER_LETTER_JOB_KIND,
        work=work,
        on_failure=reservations.refund_on_failure,
        meta=reservations.meta_for([reservation]),
        setup=reserve,
    )
    return JobAccepted(job_id=job_id)
