"""Resume endpoints: upload (as a job), list, stream the original file, delete."""

from __future__ import annotations

import functools
import logging
import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError
from app.models import UserResume
from app.schemas import JobAccepted, Mode, ResumeOut
from app.services import documents
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm import get_llm
from app.services.storage import StorageBackend, StorageError, StorageNotFound, get_storage
from app.services.uploads import read_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/resumes", tags=["resumes"])

RESUME_JOB_KIND = "resume_upload"
_MODE = TypeAdapter(Mode)

_UPLOAD_OPENAPI = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file", "mode"],
                    "properties": {
                        "file": {"type": "string", "format": "binary"},
                        "mode": {"type": "string", "enum": ["candidate", "recruiter"]},
                    },
                }
            }
        },
    }
}


def parse_mode(value: str | None) -> Mode:
    try:
        return _MODE.validate_python(value)
    except ValidationError:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Request validation failed.",
            [
                {
                    "loc": ["body", "mode"],
                    "message": "mode must be 'candidate' or 'recruiter'",
                    "type": "enum" if value else "missing",
                }
            ],
        ) from None


def content_disposition(filename: str) -> str:
    """``inline`` with an ASCII fallback and the full RFC 5987 name."""
    fallback = filename.encode("ascii", "replace").decode("ascii").replace('"', "'").replace("?", "_")
    return f"inline; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


@router.post(
    "",
    status_code=202,
    response_model=JobAccepted,
    openapi_extra=_UPLOAD_OPENAPI,
    summary="Upload a resume (PDF, DOCX or TXT); processing runs as a job",
)
async def upload_resume(
    request: Request,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    llm: Annotated[object, Depends(get_llm)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> JobAccepted:
    # 1. size (cut off mid-stream), then the rest of the cheap inline checks.
    upload = await read_upload(request, settings)
    mode = parse_mode(upload.fields.get("mode"))
    # 2. magic-byte type, page limit, dedup, per-user cap (raises plain HTTP errors).
    prepared = await documents.prepare_resume(session, user_id, upload, mode, settings)
    await session.close()  # release the connection; the job uses its own sessions

    # 3. text, OCR, character limit, decision gate, store: a job with live progress.
    work = functools.partial(
        documents.process_resume, prepared=prepared, llm=llm, storage=storage, settings=settings
    )
    job_id = await runner.submit(user_id=user_id, kind=RESUME_JOB_KIND, work=work)
    return JobAccepted(job_id=job_id)


@router.get("", response_model=list[ResumeOut], summary="List your resumes (metadata only)")
async def list_resumes(
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ResumeOut]:
    rows = await session.scalars(
        select(UserResume)
        .where(UserResume.user_id == user_id)
        .order_by(UserResume.created_at.desc(), UserResume.file_id)
    )
    return [documents.resume_out(row) for row in rows]


async def _owned_resume(session: AsyncSession, user_id: str, resume_id: uuid.UUID) -> UserResume:
    row = await session.scalar(
        select(UserResume).where(UserResume.file_id == resume_id, UserResume.user_id == user_id)
    )
    if row is None:
        raise AppError(404, "NOT_FOUND", "Resume not found.")
    return row


@router.get("/{resume_id}/file", summary="Stream the original uploaded file")
async def get_resume_file(
    resume_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> StreamingResponse:
    row = await _owned_resume(session, user_id, resume_id)
    try:
        stream = await storage.get_stream(row.storage_key)
    except StorageNotFound:
        logger.error("Resume %s has a row but no stored object (%s)", row.file_id, row.storage_key)
        raise AppError(404, "FILE_NOT_FOUND", "The stored file is no longer available.") from None
    headers = {
        "Content-Disposition": content_disposition(row.file_name or "resume"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }
    if row.file_size is not None:
        headers["Content-Length"] = str(row.file_size)
    await session.close()  # do not hold a connection while the file streams
    return StreamingResponse(stream, media_type=row.mime_type or "application/octet-stream", headers=headers)


@router.delete("/{resume_id}", status_code=204, summary="Delete a resume and its file")
async def delete_resume(
    resume_id: uuid.UUID,
    user_id: Annotated[str, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> Response:
    """Row first, then the object: a failed object delete leaves a harmless orphan that the
    startup sweep removes, never a row pointing at a missing file. Matches that used this
    resume are deleted with it (foreign key cascade)."""
    row = await _owned_resume(session, user_id, resume_id)
    key = row.storage_key
    await session.delete(row)
    await session.commit()
    try:
        await storage.delete(key)
    except StorageError:
        logger.exception("Resume row deleted but object %s could not be removed (sweep will retry)", key)
    return Response(status_code=204)
