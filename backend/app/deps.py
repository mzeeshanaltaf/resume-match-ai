"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims, current_claims
from app.config import Settings, get_settings
from app.db import get_session
from app.services import credits


async def user_with_account(
    claims: Annotated[AuthClaims, Depends(current_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """The authenticated user's id, after making sure their credit account exists.

    Every route that reads or spends credits uses this instead of ``current_user``: the
    account is created lazily on the first authenticated request (10-credit signup bonus,
    or 0 if the email belongs to an erased account), so no signup hook or webhook is needed.
    """
    await credits.ensure_account(session, claims.user_id, claims.email, settings)
    return claims.user_id


AccountUser = Annotated[str, Depends(user_with_account)]
