"""Service-to-service endpoints. Not for browsers: ``X-Internal-Key`` only, never a JWT."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_internal_key
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError
from app.schemas import EraseRequest, EraseResult
from app.services import account
from app.services.jobs import JobRunner, get_job_runner
from app.services.storage import StorageBackend, get_storage

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)])


@router.delete(
    "/users/{user_id}",
    response_model=EraseResult,
    summary="Erase every piece of app data for a user (called by Better Auth before it deletes the account)",
    responses={
        403: {"description": "FORBIDDEN: missing or wrong X-Internal-Key"},
        502: {"description": "ERASE_INCOMPLETE: rows are gone, some objects were not removed; retry"},
        503: {"description": "INTERNAL_API_DISABLED: INTERNAL_API_KEY is not configured"},
    },
)
async def erase_user(
    user_id: str,
    body: EraseRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> EraseResult:
    """Request body: ``{"email": "<the account's email>"}`` (required). Idempotent: erasing a
    user with no data succeeds, and the call can be repeated after a ``502``.

    All app rows go in one transaction (with the salted email hash that makes a re-registration
    with the same email start at 0 credits), then the objects under ``resumes/{user_id}/``."""
    # The id becomes part of a storage prefix, so anything path-like is refused outright.
    if (
        not user_id.strip()
        or len(user_id) > 255
        or user_id in (".", "..")
        or any(ch in user_id for ch in "/\\\x00")
    ):
        raise AppError(422, "VALIDATION_ERROR", "Invalid user id.")
    return await account.erase_user(session, runner, storage, settings, user_id, body.email)
