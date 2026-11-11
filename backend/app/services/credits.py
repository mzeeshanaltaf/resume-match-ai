"""Credits: lazy signup grant, atomic reserve and refund.

Every balance change is one SQL statement that updates ``user_credit_accounts`` and
inserts the matching ``user_credit_transactions`` row together (a data-modifying CTE),
so the ledger can never disagree with the balance and two concurrent reservations
can never overdraw: the ``UPDATE ... WHERE current_balance >= :amount`` row lock makes
the second reservation re-check against the committed balance.

Functions take an open ``AsyncSession`` and do **not** commit; the caller owns the
transaction (so a reservation can commit before a long AI call starts).
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import (
    CREDIT_TRANSACTION_TYPES,
    SCHEMA,
    DeletedAccount,
    UserCreditAccount,
    UserCreditTransaction,
)


class InsufficientCredits(AppError):
    def __init__(self, needed: int, balance: int | None = None) -> None:
        super().__init__(
            402,
            "INSUFFICIENT_CREDITS",
            "You do not have enough credits for this action.",
            {"needed": needed, "balance": balance},
        )


@dataclass(frozen=True)
class Reservation:
    transaction_id: uuid.UUID
    amount: int


def hash_email(email: str, salt: str) -> str:
    """Salted SHA-256 of the normalised email; the only trace kept of an erased account."""
    return hashlib.sha256(f"{salt}:{email.strip().lower()}".encode()).hexdigest()


# Raw SQL is schema-qualified so it does not depend on the connection's search_path.
# Bind parameters inside INSERT ... SELECT carry no type information, hence the casts.
_ENSURE_ACCOUNT_SQL = text(
    f"""
    WITH blocked AS (
        SELECT EXISTS (
            SELECT 1 FROM {SCHEMA}.deleted_accounts WHERE email_hash = CAST(:email_hash AS text)
        ) AS is_blocked
    ),
    account AS (
        INSERT INTO {SCHEMA}.user_credit_accounts (user_id, current_balance)
        SELECT CAST(:user_id AS text),
               CASE WHEN is_blocked THEN 0 ELSE CAST(:grant AS integer) END
        FROM blocked
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id, current_balance
    )
    INSERT INTO {SCHEMA}.user_credit_transactions
        (user_id, transaction_type, credits_delta, name_snapshot, description)
    SELECT user_id, 'signup_bonus', current_balance, 'Signup bonus', 'Welcome credits'
    FROM account
    WHERE current_balance > 0
    RETURNING transaction_id
    """
)

_RESERVE_SQL = text(
    f"""
    WITH debited AS (
        UPDATE {SCHEMA}.user_credit_accounts
        SET current_balance = current_balance - CAST(:amount AS integer), updated_at = now()
        WHERE user_id = CAST(:user_id AS text) AND current_balance >= CAST(:amount AS integer)
        RETURNING user_id
    )
    INSERT INTO {SCHEMA}.user_credit_transactions
        (user_id, transaction_type, credits_delta, reference_id, name_snapshot, description)
    SELECT user_id, CAST(:transaction_type AS text), -CAST(:amount AS integer),
           CAST(:reference_id AS uuid), CAST(:name_snapshot AS text), CAST(:description AS text)
    FROM debited
    RETURNING transaction_id
    """
)

_REFUND_SQL = text(
    f"""
    WITH credited AS (
        UPDATE {SCHEMA}.user_credit_accounts
        SET current_balance = current_balance + CAST(:amount AS integer), updated_at = now()
        WHERE user_id = CAST(:user_id AS text)
        RETURNING user_id
    )
    INSERT INTO {SCHEMA}.user_credit_transactions
        (user_id, transaction_type, credits_delta, reference_id, name_snapshot, description)
    SELECT user_id, 'refund', CAST(:amount AS integer),
           CAST(:reference_id AS uuid), CAST(:name_snapshot AS text), CAST(:description AS text)
    FROM credited
    RETURNING transaction_id
    """
)


async def ensure_account(
    session: AsyncSession, user_id: str, email: str | None, settings: Settings
) -> None:
    """Create the credit account on first use, granting the signup bonus once.

    Idempotent and race-safe (``ON CONFLICT DO NOTHING``). If the email's salted hash is
    in ``deleted_accounts`` the account starts at 0 credits and no bonus row is written.
    """
    email_hash = hash_email(email, settings.email_hash_salt) if email else ""
    await session.execute(
        _ENSURE_ACCOUNT_SQL,
        {"user_id": user_id, "email_hash": email_hash, "grant": settings.signup_credits},
    )
    await session.commit()


async def get_balance(session: AsyncSession, user_id: str) -> int:
    balance = await session.scalar(
        select(UserCreditAccount.current_balance).where(UserCreditAccount.user_id == user_id)
    )
    return balance or 0


async def reserve(
    session: AsyncSession,
    user_id: str,
    amount: int,
    transaction_type: str,
    *,
    reference_id: uuid.UUID | None = None,
    name_snapshot: str | None = None,
    description: str | None = None,
) -> Reservation:
    """Atomically deduct ``amount`` credits and write the ledger row.

    Raises ``InsufficientCredits`` (HTTP 402) when the balance is too low or no account
    exists. Does not commit.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    if transaction_type not in CREDIT_TRANSACTION_TYPES or transaction_type in (
        "refund",
        "signup_bonus",
    ):
        raise ValueError(f"not a debit transaction type: {transaction_type!r}")
    result = await session.execute(
        _RESERVE_SQL,
        {
            "user_id": user_id,
            "amount": amount,
            "transaction_type": transaction_type,
            "reference_id": reference_id,
            "name_snapshot": name_snapshot,
            "description": description,
        },
    )
    transaction_id = result.scalar_one_or_none()
    if transaction_id is None:
        raise InsufficientCredits(needed=amount, balance=await get_balance(session, user_id))
    return Reservation(transaction_id=transaction_id, amount=amount)


async def refund(
    session: AsyncSession,
    user_id: str,
    amount: int,
    *,
    reference_id: uuid.UUID | None = None,
    name_snapshot: str | None = None,
    description: str | None = None,
) -> uuid.UUID | None:
    """Atomically return ``amount`` credits and write a ``refund`` ledger row.

    Returns the new transaction id, or ``None`` if the account no longer exists (for
    example it was erased while the job ran). Does not commit.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    result = await session.execute(
        _REFUND_SQL,
        {
            "user_id": user_id,
            "amount": amount,
            "reference_id": reference_id,
            "name_snapshot": name_snapshot,
            "description": description,
        },
    )
    return result.scalar_one_or_none()


async def record_deleted_account(session: AsyncSession, email: str, settings: Settings) -> None:
    """Remember a salted hash of an erased account's email. Does not commit."""
    stmt = (
        pg_insert(DeletedAccount)
        .values(email_hash=hash_email(email, settings.email_hash_salt))
        .on_conflict_do_nothing(index_elements=["email_hash"])
    )
    await session.execute(stmt)


async def list_transactions(
    session: AsyncSession, user_id: str, *, limit: int = 50, offset: int = 0
) -> list[UserCreditTransaction]:
    rows = await session.scalars(
        select(UserCreditTransaction)
        .where(UserCreditTransaction.user_id == user_id)
        .order_by(UserCreditTransaction.created_at.desc(), UserCreditTransaction.transaction_id)
        .limit(limit)
        .offset(offset)
    )
    return list(rows)


__all__ = [
    "InsufficientCredits",
    "Reservation",
    "ensure_account",
    "get_balance",
    "hash_email",
    "list_transactions",
    "record_deleted_account",
    "refund",
    "reserve",
]
