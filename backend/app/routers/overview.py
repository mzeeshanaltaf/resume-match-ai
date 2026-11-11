"""Overview: counts, balance and recent matches in one call (replaces n8n ``get_user_data``)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.deps import AccountUser
from app.models import JobMatchSummary, UserJd, UserResume
from app.schemas import OverviewCounts, OverviewOut
from app.services import credits, matching

router = APIRouter(prefix="/v1/overview", tags=["overview"])


async def _count(session: AsyncSession, model: type, user_id: str) -> int:
    return int(
        await session.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))  # type: ignore[attr-defined]
        or 0
    )


@router.get("", response_model=OverviewOut, summary="Balance, counts and recent matches")
async def get_overview(
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OverviewOut:
    recent = (
        await session.execute(matching.match_query(user_id).limit(settings.overview_recent_matches))
    ).all()
    return OverviewOut(
        balance=await credits.get_balance(session, user_id),
        counts=OverviewCounts(
            resumes=await _count(session, UserResume, user_id),
            job_descriptions=await _count(session, UserJd, user_id),
            matches=await _count(session, JobMatchSummary, user_id),
        ),
        recent_matches=[matching.match_list_item(*row) for row in recent],
    )
