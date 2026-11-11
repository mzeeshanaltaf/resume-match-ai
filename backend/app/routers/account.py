"""Account data export (the user's own data, as a ZIP)."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.auth import AuthClaims, current_claims
from app.config import Settings, get_settings
from app.db import get_session
from app.services import account
from app.services.storage import StorageBackend, get_storage

router = APIRouter(prefix="/v1/account", tags=["account"])


@router.get(
    "/export",
    summary="Download everything you own as a ZIP (once per hour)",
    response_class=FileResponse,
    responses={
        200: {"content": {"application/zip": {}}, "description": "The ZIP archive"},
        429: {"description": "EXPORT_RATE_LIMITED: details.retry_after_seconds, Retry-After header"},
    },
)
async def export_account(
    claims: Annotated[AuthClaims, Depends(current_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage)],
) -> FileResponse:
    """Contents: ``profile.json``, ``resumes/`` (original files), ``resumes.json`` (details and
    extracted text), ``job_descriptions.json``, ``matches.json`` (full reports),
    ``generated_documents.json``, ``credit_transactions.json`` and a ``README.txt``. The ZIP is
    built into a temporary file (deleted after the response) and streamed."""
    user_id = claims.user_id
    slot = await account.claim_export(session, user_id, settings.export_cooldown_seconds)
    try:
        built = await account.build_export_zip(session, storage, user_id, claims.email)
    except BaseException:
        await session.rollback()
        await account.finish_export(session, slot, ok=False)  # let the user retry
        raise
    await account.finish_export(session, slot, ok=True)
    await session.close()

    return FileResponse(
        built.path,
        media_type="application/zip",
        filename=built.filename,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        background=BackgroundTask(os.unlink, built.path),
    )
