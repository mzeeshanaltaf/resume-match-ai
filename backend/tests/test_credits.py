from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.models import UserCreditAccount, UserCreditTransaction
from app.services import credits
from app.services.credits import InsufficientCredits


async def _tx(session: AsyncSession, user_id: str) -> list[UserCreditTransaction]:
    session.expire_all()
    return list(
        await session.scalars(
            select(UserCreditTransaction)
            .where(UserCreditTransaction.user_id == user_id)
            .order_by(UserCreditTransaction.created_at, UserCreditTransaction.credits_delta)
        )
    )


async def test_first_use_grants_signup_credits_once(session: AsyncSession, settings: Settings) -> None:
    await credits.ensure_account(session, "u1", "u1@example.com", settings)
    await credits.ensure_account(session, "u1", "u1@example.com", settings)
    assert await credits.get_balance(session, "u1") == 10
    rows = await _tx(session, "u1")
    assert [(r.transaction_type, r.credits_delta) for r in rows] == [("signup_bonus", 10)]


async def test_concurrent_first_requests_grant_exactly_once(
    sessionmaker: async_sessionmaker[AsyncSession], settings: Settings
) -> None:
    async def first_request() -> None:
        async with sessionmaker() as s:
            await credits.ensure_account(s, "racer", "r@example.com", settings)

    await asyncio.gather(*(first_request() for _ in range(8)))
    async with sessionmaker() as s:
        assert await credits.get_balance(s, "racer") == 10
        assert len(await _tx(s, "racer")) == 1


async def test_signup_grant_follows_settings(session: AsyncSession, make_settings: Any) -> None:
    await credits.ensure_account(session, "u1", None, make_settings(signup_credits=3))
    assert await credits.get_balance(session, "u1") == 3


async def test_deleted_email_starts_at_zero_with_no_bonus_row(
    session: AsyncSession, settings: Settings
) -> None:
    await credits.record_deleted_account(session, "Former.User@Example.com", settings)
    await session.commit()
    # Different casing/whitespace of the same address is still recognised.
    await credits.ensure_account(session, "new-id", "  former.user@example.COM ", settings)
    assert await credits.get_balance(session, "new-id") == 0
    assert await _tx(session, "new-id") == []
    # The account exists, so a later request does not grant credits either.
    await credits.ensure_account(session, "new-id", "former.user@example.com", settings)
    assert await credits.get_balance(session, "new-id") == 0


async def test_other_emails_unaffected_by_deleted_accounts(
    session: AsyncSession, settings: Settings
) -> None:
    await credits.record_deleted_account(session, "gone@example.com", settings)
    await session.commit()
    await credits.ensure_account(session, "u2", "someone.else@example.com", settings)
    assert await credits.get_balance(session, "u2") == 10


def test_email_hash_is_salted_and_normalised() -> None:
    a = credits.hash_email("A@x.com", "salt1")
    assert a == credits.hash_email(" a@X.COM ", "salt1")
    assert a != credits.hash_email("a@x.com", "salt2")
    assert "a@x.com" not in a


async def test_reserve_debits_and_writes_ledger_row(session: AsyncSession, settings: Settings) -> None:
    await credits.ensure_account(session, "u1", None, settings)
    ref = uuid.uuid4()
    reservation = await credits.reserve(
        session, "u1", 1, "match_analysis", reference_id=ref, name_snapshot="Acme / Engineer"
    )
    await session.commit()
    assert reservation.amount == 1
    assert await credits.get_balance(session, "u1") == 9
    row = (await _tx(session, "u1"))[-1]
    assert (row.transaction_type, row.credits_delta, row.reference_id) == ("match_analysis", -1, ref)
    assert row.transaction_id == reservation.transaction_id
    assert row.name_snapshot == "Acme / Engineer"


async def test_reserve_when_insufficient_raises_402_and_changes_nothing(
    session: AsyncSession, make_settings: Any
) -> None:
    await credits.ensure_account(session, "u1", None, make_settings(signup_credits=1))
    with pytest.raises(InsufficientCredits) as info:
        await credits.reserve(session, "u1", 2, "screening")
    assert info.value.status_code == 402
    assert info.value.code == "INSUFFICIENT_CREDITS"
    assert info.value.details == {"needed": 2, "balance": 1}
    assert await credits.get_balance(session, "u1") == 1
    assert len(await _tx(session, "u1")) == 1  # only the signup bonus


async def test_reserve_without_account_is_insufficient(session: AsyncSession) -> None:
    with pytest.raises(InsufficientCredits):
        await credits.reserve(session, "ghost", 1, "match_analysis")


async def test_refund_returns_credits_and_writes_ledger_row(
    session: AsyncSession, settings: Settings
) -> None:
    await credits.ensure_account(session, "u1", None, settings)
    ref = uuid.uuid4()
    await credits.reserve(session, "u1", 1, "match_analysis", reference_id=ref)
    tx_id = await credits.refund(session, "u1", 1, reference_id=ref, description="job failed")
    await session.commit()
    assert tx_id is not None
    assert await credits.get_balance(session, "u1") == 10
    rows = await _tx(session, "u1")
    assert sorted(r.credits_delta for r in rows) == [-1, 1, 10]
    assert any(r.transaction_type == "refund" and r.reference_id == ref for r in rows)


async def test_refund_for_missing_account_is_a_noop(session: AsyncSession) -> None:
    assert await credits.refund(session, "ghost", 1) is None
    assert await session.scalar(select(func.count()).select_from(UserCreditTransaction)) == 0


@pytest.mark.parametrize("bad", ["refund", "signup_bonus", "made_up"])
async def test_reserve_rejects_non_debit_types(session: AsyncSession, bad: str) -> None:
    with pytest.raises(ValueError):
        await credits.reserve(session, "u1", 1, bad)


async def test_non_positive_amounts_rejected(session: AsyncSession) -> None:
    with pytest.raises(ValueError):
        await credits.reserve(session, "u1", 0, "match_analysis")
    with pytest.raises(ValueError):
        await credits.refund(session, "u1", -1)


async def test_concurrent_reservations_never_overdraw(
    sessionmaker: async_sessionmaker[AsyncSession], make_settings: Any
) -> None:
    async with sessionmaker() as s:
        await credits.ensure_account(s, "busy", None, make_settings(signup_credits=3))

    async def attempt() -> bool:
        async with sessionmaker() as s:  # own connection per attempt
            try:
                await credits.reserve(s, "busy", 1, "match_analysis")
                await s.commit()
                return True
            except InsufficientCredits:
                await s.rollback()
                return False

    results = await asyncio.gather(*(attempt() for _ in range(25)))

    assert sum(results) == 3
    async with sessionmaker() as s:
        assert await credits.get_balance(s, "busy") == 0
        debits = [r for r in await _tx(s, "busy") if r.credits_delta < 0]
        assert len(debits) == 3
        total = await s.scalar(
            select(func.sum(UserCreditTransaction.credits_delta)).where(
                UserCreditTransaction.user_id == "busy"
            )
        )
        assert total == 0  # ledger sums to the balance


async def test_ledger_always_matches_balance_under_mixed_load(
    sessionmaker: async_sessionmaker[AsyncSession], settings: Settings
) -> None:
    async with sessionmaker() as s:
        await credits.ensure_account(s, "mix", None, settings)

    async def reserve_then_maybe_refund(i: int) -> None:
        async with sessionmaker() as s:
            try:
                await credits.reserve(s, "mix", 1, "match_analysis")
            except InsufficientCredits:
                await s.rollback()
                return
            if i % 2:
                await credits.refund(s, "mix", 1)
            await s.commit()

    await asyncio.gather(*(reserve_then_maybe_refund(i) for i in range(30)))
    async with sessionmaker() as s:
        balance = await credits.get_balance(s, "mix")
        total = await s.scalar(
            select(func.sum(UserCreditTransaction.credits_delta)).where(
                UserCreditTransaction.user_id == "mix"
            )
        )
        assert balance == total
        assert balance >= 0
        assert await s.scalar(select(func.count()).select_from(UserCreditAccount)) == 1


async def test_list_transactions_newest_first(session: AsyncSession, settings: Settings) -> None:
    await credits.ensure_account(session, "u1", None, settings)
    await session.execute(text("SELECT pg_sleep(0.01)"))
    await credits.reserve(session, "u1", 1, "match_analysis")
    await session.commit()
    rows = await credits.list_transactions(session, "u1")
    assert [r.transaction_type for r in rows] == ["match_analysis", "signup_bonus"]
