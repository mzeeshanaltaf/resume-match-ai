"""Credits: balance (with the price list) and the ledger."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.deps import AccountUser
from app.models import UserCreditTransaction
from app.schemas import CreditCosts, CreditsOut, CreditTransactionOut
from app.services import credits

router = APIRouter(prefix="/v1/credits", tags=["credits"])


@router.get("", response_model=CreditsOut, summary="Credit balance and what each action costs")
async def get_credits(
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CreditsOut:
    """The first authenticated call creates the account with the signup bonus."""
    return CreditsOut(
        balance=await credits.get_balance(session, user_id),
        costs=CreditCosts(
            match=settings.match_credit_cost,
            cover_letter=settings.cover_letter_credit_cost,
            screening_per_resume=settings.screening_credit_cost_per_resume,
        ),
    )


@router.get(
    "/transactions",
    response_model=list[CreditTransactionOut],
    summary="The credit ledger, newest first (total in X-Total-Count)",
)
async def list_transactions(
    response: Response,
    user_id: AccountUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int | None, Query(ge=1, le=1000, description="Omit to return the whole ledger.")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[CreditTransactionOut]:
    total = await session.scalar(
        select(func.count())
        .select_from(UserCreditTransaction)
        .where(UserCreditTransaction.user_id == user_id)
    )
    rows = await credits.list_transactions(session, user_id, limit=limit, offset=offset)
    response.headers["X-Total-Count"] = str(total or 0)
    return [
        CreditTransactionOut(
            id=row.transaction_id,
            transaction_type=row.transaction_type,
            credits_delta=row.credits_delta,
            reference_id=row.reference_id,
            name_snapshot=row.name_snapshot,
            description=row.description,
            created_at=row.created_at,
        )
        for row in rows
    ]
