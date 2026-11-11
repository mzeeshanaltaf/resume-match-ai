"""Resume and job-description pipelines (everything between "request accepted" and "stored").

Order of operations (master plan, "Validation gate"), cheapest check first so an unusable
document is refused before it costs anything:

Resume
  inline  (before a job exists, plain HTTP errors):
      size (streamed cut-off) -> magic-byte type -> page limit -> dedup -> per-user cap
  in the job (progress events):
      parsing (text layer) -> ocr (only if scanned) -> character limit
      -> validating (Decisions gate) -> saving (object, then row)

Job description
  inline:  pasted-text length -> dedup
  in the job:  scraping (URL only) -> validating (Decisions gate) -> analyzing (field
               extraction) -> saving

Deviation from the master plan's wording (recorded in handoff.md): the plan lists dedup,
the page limit and the cap as job steps; they are deterministic, need no AI call, and
report better as direct HTTP errors, so they run inline. Everything that can take
seconds or costs an AI call runs in the job.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import UserJd, UserResume
from app.schemas import JdExtraction, JobDescriptionCreate, JobDescriptionOut, Mode, ResumeOut
from app.services import extraction, prompts, validation
from app.services.jobs import JobContext
from app.services.storage import StorageBackend, StorageError, resume_key
from app.services.uploads import Upload

logger = logging.getLogger(__name__)


# ── Dedup hashes (same inputs as the n8n workflow) ──────────────────────────


def _bool_text(value: bool) -> str:
    return "true" if value else "false"  # how n8n's string concatenation rendered booleans


def resume_checksum(data: bytes, is_candidate: bool, user_id: str) -> str:
    """sha256( sha256(file bytes) + is_candidate + user_id ), as in the n8n workflow."""
    binary_hash = hashlib.sha256(data).hexdigest()
    return hashlib.sha256(f"{binary_hash}{_bool_text(is_candidate)}{user_id}".encode()).hexdigest()


def jd_checksum(source: str, is_candidate: bool, user_id: str) -> str:
    """sha256( jd_url-or-jd_text + is_candidate + user_id ), as in the n8n workflow."""
    return hashlib.sha256(f"{source}{_bool_text(is_candidate)}{user_id}".encode()).hexdigest()


# ── Row -> API model ────────────────────────────────────────────────────────


def mode_of(is_candidate: bool | None) -> Mode:
    return "candidate" if is_candidate else "recruiter"


def resume_out(row: UserResume) -> ResumeOut:
    return ResumeOut(
        id=row.file_id,
        file_name=row.file_name,
        file_size=row.file_size,
        mime_type=row.mime_type,
        num_pages=row.num_pages,
        num_characters=row.num_characters,
        num_words=row.num_words,
        is_scanned=bool(row.is_scanned),
        mode=mode_of(row.is_candidate),
        created_at=row.created_at,
    )


def jd_out(row: UserJd) -> JobDescriptionOut:
    return JobDescriptionOut(
        id=row.url_id,
        jd_url=row.jd_url,
        mode=mode_of(row.is_candidate),
        validation_note=row.validation_note,
        jd_object=row.jd_object,
        created_at=row.created_at,
    )


# ── Resume: inline preparation ──────────────────────────────────────────────


@dataclass(frozen=True)
class PreparedResume:
    file_id: uuid.UUID
    file_name: str
    data: bytes
    info: extraction.FileInfo
    is_candidate: bool
    checksum: str


async def _count_resumes(session: AsyncSession, user_id: str) -> int:
    return int(
        await session.scalar(
            select(func.count()).select_from(UserResume).where(UserResume.user_id == user_id)
        )
        or 0
    )


def _resume_limit_error(settings: Settings) -> AppError:
    return AppError(
        409,
        "RESUME_LIMIT_REACHED",
        f"You can store up to {settings.max_resumes_per_user} resumes. Delete one to upload another.",
        {"max_resumes": settings.max_resumes_per_user},
    )


async def prepare_resume(
    session: AsyncSession, user_id: str, upload: Upload, mode: Mode, settings: Settings
) -> PreparedResume:
    """Type, page limit, dedup and per-user cap. Raises before any job or AI call."""
    info = await asyncio.to_thread(extraction.inspect_file, upload.data, settings)
    is_candidate = mode == "candidate"
    checksum = resume_checksum(upload.data, is_candidate, user_id)

    existing = await session.execute(
        select(UserResume.file_id, UserResume.file_name).where(
            UserResume.user_id == user_id, UserResume.checksum == checksum
        )
    )
    if (duplicate := existing.first()) is not None:
        raise AppError(
            409,
            "DUPLICATE_RESUME",
            "You have already uploaded this resume.",
            {"resume_id": str(duplicate.file_id), "file_name": duplicate.file_name},
        )
    if await _count_resumes(session, user_id) >= settings.max_resumes_per_user:
        raise _resume_limit_error(settings)

    return PreparedResume(
        file_id=uuid.uuid4(),
        file_name=upload.filename,
        data=upload.data,
        info=info,
        is_candidate=is_candidate,
        checksum=checksum,
    )


# ── Resume: the job ─────────────────────────────────────────────────────────


async def process_resume(
    ctx: JobContext,
    prepared: PreparedResume,
    *,
    llm: Any,
    storage: StorageBackend,
    settings: Settings,
) -> dict[str, Any]:
    is_scanned = False
    async with ctx.step("parsing", "Reading your file"):
        extracted = await extraction.extract_text(prepared.data, prepared.info, settings)
        text = extracted.text

    if extracted.is_scanned:
        is_scanned = True
        async with ctx.step("ocr", "Reading scanned pages"):
            text = await extraction.transcribe_scanned_pdf(prepared.data, llm, settings)
        if len(text) < settings.scanned_pdf_min_chars:
            raise AppError(
                422,
                "UNREADABLE_DOCUMENT",
                "We couldn't read any text in this scan. Try a clearer scan or upload a text version.",
            )

    if len(text) > settings.max_resume_chars:
        raise AppError(
            422,
            "TEXT_LIMIT_EXCEEDED",
            f"This resume has {len(text):,} characters of text; the limit is "
            f"{settings.max_resume_chars:,}.",
            {"characters": len(text), "max_characters": settings.max_resume_chars},
        )

    async with ctx.step("validating", "Checking that it's a resume"):
        if not text.strip():
            # Nothing to classify (blank page): reject without spending a model call.
            raise AppError(
                422,
                "INVALID_RESUME",
                "This file has no text, so it can't be a resume.",
                {"detected_type": "other", "probability": None},
            )
        gate = await validation.validate_resume(text, llm, settings)

    async with ctx.step("saving", "Saving your resume"):
        characters, words = extraction.text_stats(text)
        key = resume_key(ctx.user_id, prepared.file_id)
        await storage.put(key, prepared.data, prepared.info.mime_type)
        row = UserResume(
            file_id=prepared.file_id,
            user_id=ctx.user_id,
            file_name=prepared.file_name,
            file_size=len(prepared.data),
            mime_type=prepared.info.mime_type,
            num_pages=prepared.info.num_pages,
            num_characters=characters,
            num_words=words,
            is_scanned=is_scanned,
            is_resume=True,
            is_candidate=prepared.is_candidate,
            reasoning=gate.note("resume"),
            storage_key=key,
            file_text=text,
            checksum=prepared.checksum,
        )
        try:
            async with ctx.sessionmaker() as session:
                # Re-check under the insert: another upload may have landed since the inline check.
                if await _count_resumes(session, ctx.user_id) >= settings.max_resumes_per_user:
                    raise _resume_limit_error(settings)
                session.add(row)
                await session.commit()
                await session.refresh(row)  # load server defaults (created_at) while attached
        except IntegrityError as exc:
            await _discard_object(storage, key)
            raise _duplicate_resume_error(prepared) from exc
        except BaseException:
            await _discard_object(storage, key)
            raise

    out = resume_out(row)
    return {"resume_id": str(row.file_id), "resume": out.model_dump(mode="json")}


def _duplicate_resume_error(prepared: PreparedResume) -> AppError:
    return AppError(
        409,
        "DUPLICATE_RESUME",
        "You have already uploaded this resume.",
        {"file_name": prepared.file_name},
    )


async def _discard_object(storage: StorageBackend, key: str) -> None:
    """Best-effort removal of an object whose row was never written (the sweep is the backstop)."""
    try:
        await storage.delete(key)
    except StorageError:
        logger.exception("Could not remove unreferenced object %s", key)


# ── Job description: inline preparation ─────────────────────────────────────


@dataclass(frozen=True)
class PreparedJd:
    url: str | None
    text: str | None
    is_candidate: bool
    checksum: str


async def prepare_jd(
    session: AsyncSession, user_id: str, body: JobDescriptionCreate, settings: Settings
) -> PreparedJd:
    text = body.text.strip() if body.text and body.text.strip() else None
    if text is not None and len(text) > settings.max_jd_chars:
        raise AppError(
            422,
            "JD_TEXT_TOO_LONG",
            f"The job description has {len(text):,} characters; the limit is {settings.max_jd_chars:,}.",
            {"characters": len(text), "max_characters": settings.max_jd_chars},
        )
    is_candidate = body.mode == "candidate"
    source = body.url if body.url else text or ""
    checksum = jd_checksum(source, is_candidate, user_id)

    existing = await session.execute(
        select(UserJd.url_id, UserJd.jd_url).where(
            UserJd.user_id == user_id, UserJd.checksum == checksum
        )
    )
    if (duplicate := existing.first()) is not None:
        raise AppError(
            409,
            "DUPLICATE_JD",
            "You have already added this job description.",
            {"jd_id": str(duplicate.url_id), "jd_url": duplicate.jd_url},
        )
    return PreparedJd(
        url=body.url or None, text=None if body.url else text, is_candidate=is_candidate, checksum=checksum
    )


# ── Job description: the job ────────────────────────────────────────────────


async def process_jd(
    ctx: JobContext,
    prepared: PreparedJd,
    *,
    llm: Any,
    firecrawl: Any,
    settings: Settings,
) -> dict[str, Any]:
    if prepared.url:
        async with ctx.step("scraping", "Reading the job page"):
            page = await firecrawl.scrape(prepared.url)
            text = page.text
    else:
        text = prepared.text or ""
    text = text[: settings.max_jd_chars]

    async with ctx.step("validating", "Checking that it's a job posting"):
        gate = await validation.validate_jd(text, llm, settings)

    async with ctx.step("analyzing", "Extracting the role details"):
        extracted: JdExtraction = await llm.parse(
            "jd",
            instructions=prompts.JD_EXTRACTION_INSTRUCTIONS,
            input=prompts.jd_extraction_input(text),
            schema=JdExtraction,
        )

    note = gate.note("jd")
    # Same keys the n8n extractor stored, so the report/matching code reads one shape.
    jd_object = {**extracted.model_dump(), "is_job_description": True, "validation_note": note}

    async with ctx.step("saving", "Saving the job description"):
        row = UserJd(
            url_id=uuid.uuid4(),
            jd_url=prepared.url,
            user_id=ctx.user_id,
            is_candidate=prepared.is_candidate,
            is_jd=True,
            validation_note=note,
            jd_object=jd_object,
            checksum=prepared.checksum,
        )
        try:
            async with ctx.sessionmaker() as session:
                session.add(row)
                await session.commit()
                await session.refresh(row)
        except IntegrityError as exc:
            raise AppError(
                409, "DUPLICATE_JD", "You have already added this job description.", {"jd_url": prepared.url}
            ) from exc

    out = jd_out(row)
    return {"jd_id": str(row.url_id), "job_description": out.model_dump(mode="json")}
