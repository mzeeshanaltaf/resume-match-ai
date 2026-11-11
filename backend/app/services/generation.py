"""Tailored resume bullets and cover letters for a finished match.

* Tailored bullets are **included in the match credit**: no charge, and at most one per match
  (a unique index enforces it; a second request is ``409 ALREADY_GENERATED``).
* A cover letter costs ``COVER_LETTER_CREDIT_COST`` credit(s) each time it is generated.
  The credit is reserved with the job row, refunded if generation fails.

Both are candidate-mode only: a recruiter's screening has no resume to tailor and no letter to
send, so asking for one is ``422 CANDIDATE_ONLY``. Results are stored in ``generated_documents``
and returned with ``GET /v1/matches/{id}``.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import GeneratedDocument, JobMatchSummary, UserJd, UserResume
from app.schemas import CoverLetterOutput, GeneratedDocumentOut, TailoredBulletsOutput
from app.services import prompts, reservations
from app.services.jobs import JobContext

logger = logging.getLogger(__name__)

BULLETS_JOB_KIND = "tailored_bullets"
COVER_LETTER_JOB_KIND = "cover_letter"
BULLETS = "tailored_bullets"
COVER_LETTER = "cover_letter"

_BULLETS_UNIQUE_INDEX = "uq_generated_documents_bullets_per_match"


@dataclass(frozen=True)
class GenerationInput:
    match_id: uuid.UUID
    resume_text: str
    jd_text: str
    analysis_json: str
    job_title: str | None
    company_name: str | None
    file_name: str | None

    @property
    def label(self) -> str:
        job = self.job_title or "job"
        company = f" at {self.company_name}" if self.company_name else ""
        return f"{job}{company}"

    def model_input(self) -> str:
        return prompts.generation_input(self.resume_text, self.jd_text, self.analysis_json)


async def load_generation_input(session: AsyncSession, user_id: str, match_id: uuid.UUID) -> GenerationInput:
    """The caller's candidate-mode match with its resume and job, or 404 / 422."""
    row = (
        await session.execute(
            select(JobMatchSummary, UserResume, UserJd)
            .join(UserResume, UserResume.file_id == JobMatchSummary.file_id)
            .outerjoin(UserJd, UserJd.url_id == JobMatchSummary.url_id)
            .where(JobMatchSummary.summary_id == match_id, JobMatchSummary.user_id == user_id)
        )
    ).first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Match not found.")
    match, resume, jd = row
    if not match.is_candidate:
        raise AppError(
            422,
            "CANDIDATE_ONLY",
            "Tailored bullets and cover letters are only available for Job Fit matches, "
            "not recruiter screenings.",
        )
    jd_object: dict[str, Any] = (jd.jd_object if jd else None) or {}
    return GenerationInput(
        match_id=match.summary_id,
        resume_text=resume.file_text or "",
        jd_text=prompts.build_job_description_text(jd_object),
        analysis_json=json.dumps(match.job_match_summary or {}, ensure_ascii=False, indent=1),
        job_title=jd_object.get("job_title"),
        company_name=jd_object.get("company_name"),
        file_name=resume.file_name,
    )


async def existing_bullets(session: AsyncSession, match_id: uuid.UUID) -> GeneratedDocument | None:
    return await session.scalar(
        select(GeneratedDocument).where(
            GeneratedDocument.match_id == match_id, GeneratedDocument.kind == BULLETS
        )
    )


def cover_letter_reservation(item: GenerationInput, document_id: uuid.UUID, amount: int) -> dict[str, Any]:
    return reservations.entry(
        document_id,
        amount,
        reservations.DOCUMENT,
        name=item.file_name,
        description=f"Cover letter: {item.label}",
    )


def _cover_letter_text(letter: CoverLetterOutput) -> str:
    parts = [letter.salutation.strip(), *(p.strip() for p in letter.paragraphs), letter.closing.strip()]
    if letter.signature.strip():
        parts.append(letter.signature.strip())
    return "\n\n".join(part for part in parts if part)


async def _store(
    ctx: JobContext, document: GeneratedDocument
) -> GeneratedDocument:
    try:
        async with ctx.sessionmaker() as session:
            session.add(document)
            await session.commit()
            await session.refresh(document)
    except IntegrityError as exc:
        if _BULLETS_UNIQUE_INDEX in str(exc.orig):
            raise AppError(
                409, "ALREADY_GENERATED", "Tailored bullets were already generated for this match."
            ) from exc
        raise AppError(
            409, "SOURCE_DELETED", "The match was deleted while the document was being written."
        ) from exc
    return document


def _result(document: GeneratedDocument) -> dict[str, Any]:
    out = GeneratedDocumentOut.model_validate(document, from_attributes=True)
    return {"document_id": str(document.id), "document": out.model_dump(mode="json")}


async def run_tailored_bullets(ctx: JobContext, *, item: GenerationInput, llm: Any) -> dict[str, Any]:
    async with ctx.step("generating", "Rewriting your summary and bullets"):
        output: TailoredBulletsOutput = await llm.parse(
            "bullets",
            instructions=prompts.TAILORED_BULLETS_INSTRUCTIONS,
            input=item.model_input(),
            schema=TailoredBulletsOutput,
        )
    async with ctx.step("saving", "Saving"):
        document = await _store(
            ctx,
            GeneratedDocument(
                id=uuid.uuid4(),
                match_id=item.match_id,
                kind=BULLETS,
                content=output.model_dump(mode="json"),
            ),
        )
    return _result(document)


async def run_cover_letter(
    ctx: JobContext, *, item: GenerationInput, document_id: uuid.UUID, llm: Any
) -> dict[str, Any]:
    async with ctx.step("generating", "Drafting your cover letter"):
        output: CoverLetterOutput = await llm.parse(
            "cover_letter",
            instructions=prompts.COVER_LETTER_INSTRUCTIONS,
            input=item.model_input(),
            schema=CoverLetterOutput,
        )
    async with ctx.step("saving", "Saving"):
        content = output.model_dump(mode="json")
        content["text"] = _cover_letter_text(output)
        document = await _store(
            ctx,
            GeneratedDocument(id=document_id, match_id=item.match_id, kind=COVER_LETTER, content=content),
        )
    return _result(document)
