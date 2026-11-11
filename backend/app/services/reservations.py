"""Credit reservations made by jobs, and refunding what a job did not deliver.

A job that spends credits records each reservation in its ``jobs.meta``::

    {"reservations": [{"reference_id": "<uuid>", "amount": 1, "kind": "match" | "document",
                       "name": "<ledger name>", "description": "<ledger text>"}]}

``reference_id`` is the id of the thing being bought (the match's ``summary_id`` or the
generated document's ``id``) and is written to the ledger as the transaction's
``reference_id``, so ledger rows point at what they paid for.

Refunding is *idempotent and derived from the data*, not from a counter: a reservation is
owed back only if the thing it bought does not exist and no ``refund`` row for it exists
yet. That makes one function correct for every path that can end a job badly: the failure
hook, a single failed screening item, a job cancelled at shutdown, and startup recovery of
a job whose process died (partially delivered screenings keep the items that finished and
refund only the rest).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GeneratedDocument, Job, JobMatchSummary, UserCreditTransaction
from app.services import credits
from app.services.jobs import JobContext

logger = logging.getLogger(__name__)

MATCH = "match"
DOCUMENT = "document"


def entry(
    reference_id: uuid.UUID,
    amount: int,
    kind: str,
    *,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    return {
        "reference_id": str(reference_id),
        "amount": amount,
        "kind": kind,
        "name": name,
        "description": description,
    }


def meta_for(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {"reservations": entries}


async def _delivered(session: AsyncSession, reservation: dict[str, Any]) -> bool:
    reference = uuid.UUID(reservation["reference_id"])
    if reservation["kind"] == MATCH:
        stmt = select(exists().where(JobMatchSummary.summary_id == reference))
    else:
        stmt = select(exists().where(GeneratedDocument.id == reference))
    return bool(await session.scalar(stmt))


async def _already_refunded(session: AsyncSession, user_id: str, reference: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(
                exists().where(
                    UserCreditTransaction.user_id == user_id,
                    UserCreditTransaction.reference_id == reference,
                    UserCreditTransaction.transaction_type == "refund",
                )
            )
        )
    )


async def refund_entry(session: AsyncSession, user_id: str, reservation: dict[str, Any]) -> bool:
    """Refund one reservation unless it was delivered or is already refunded.

    Returns True if credits were returned. Does not commit.
    """
    reference = uuid.UUID(reservation["reference_id"])
    if await _delivered(session, reservation) or await _already_refunded(session, user_id, reference):
        return False
    refund_id = await credits.refund(
        session,
        user_id,
        int(reservation["amount"]),
        reference_id=reference,
        name_snapshot=reservation.get("name"),
        description=f"Refund: {reservation.get('description') or 'the request did not complete'}",
    )
    return refund_id is not None


async def refund_undelivered(session: AsyncSession, user_id: str, meta: dict[str, Any] | None) -> int:
    """Refund every reservation in ``meta`` that was not delivered. Returns credits refunded."""
    refunded = 0
    for reservation in (meta or {}).get("reservations", []):
        if await refund_entry(session, user_id, reservation):
            refunded += int(reservation["amount"])
    return refunded


async def refund_on_failure(session: AsyncSession, ctx: JobContext, error: dict[str, Any]) -> None:
    """``JobRunner`` failure hook: runs in the transaction that marks the job failed."""
    refunded = await refund_undelivered(session, ctx.user_id, ctx.meta)
    if refunded:
        logger.info("Job %s (%s) failed with %s: refunded %d credit(s)", ctx.id, ctx.kind, error.get("code"), refunded)


async def refund_interrupted(session: AsyncSession, job: Job) -> None:
    """Startup recovery handler: the process died while the job was queued or running."""
    refunded = await refund_undelivered(session, job.user_id, job.meta)
    if refunded:
        logger.warning("Interrupted job %s (%s): refunded %d credit(s)", job.id, job.kind, refunded)
