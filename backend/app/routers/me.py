"""Stub protected route: proves the auth + lazy-credit-account path end to end.

Phase 3 replaces this with the real ``/v1/credits`` and ``/v1/overview`` endpoints.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims, current_claims
from app.config import Settings, get_settings
from app.db import get_session
from app.services import credits

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me")
async def me(
    claims: Annotated[AuthClaims, Depends(current_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, object]:
    # First authenticated request creates the credit account (10-credit signup grant).
    await credits.ensure_account(session, claims.user_id, claims.email, settings)
    balance = await credits.get_balance(session, claims.user_id)
    return {"user_id": claims.user_id, "credits": balance}
