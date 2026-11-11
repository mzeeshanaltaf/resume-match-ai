"""Account data export and erase.

Export (``GET /v1/account/export``)
    A ZIP of everything the user owns, built into a temp file (never held in memory; resume
    files are copied one at a time) and streamed. One export per ``EXPORT_COOLDOWN_SECONDS``
    per user: the cooldown lives in the ``jobs`` table (an ``account_export`` row), so it
    survives restarts and is claimed atomically under a per-user advisory lock.

Erase (``DELETE /internal/users/{id}``, service-to-service)
    Cancels the user's running jobs, deletes every app row in **one transaction** and records
    the salted email hash (so re-registering the same address starts with 0 credits), then
    deletes the objects under the user's storage prefix. The database comes first on purpose:
    a leftover object is a harmless orphan (the startup sweep collects it), a row pointing at
    a missing file is not. Everything is idempotent: if the object delete fails the endpoint
    answers 502 and a retry finishes the job.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, extract, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import (
    GeneratedDocument,
    Job,
    JobMatchSummary,
    UserCreditAccount,
    UserCreditTransaction,
    UserJd,
    UserResume,
)
from app.schemas import CreditTransactionOut, EraseResult, GeneratedDocumentOut
from app.services import credits, documents, matching
from app.services.jobs import JobRunner
from app.services.storage import StorageBackend, StorageError, StorageNotFound, user_prefix

logger = logging.getLogger(__name__)

EXPORT_JOB_KIND = "account_export"

README_TEXT = """ResuMatchAI data export
=======================

This archive holds everything ResuMatchAI stores about your account.

profile.json               Your account id, email and current credit balance.
resumes/                   The original files you uploaded (name prefixed with the resume id).
resumes.json               One entry per resume: details, the extracted text, and which file in
                           resumes/ it is.
job_descriptions.json      Every job description you added, with the extracted fields.
matches.json               Every match report (Job Fit analyses and screening scores).
generated_documents.json   Tailored resume bullets and cover letters generated for your matches.
credit_transactions.json   Your full credit ledger (grants, charges and refunds).

Dates are UTC (ISO 8601). Ids link the files together: matches.json refers to resumes.json and
job_descriptions.json by id, generated_documents.json refers to matches.json.
"""


# ── Export ──────────────────────────────────────────────────────────────────


async def claim_export(session: AsyncSession, user_id: str, cooldown_seconds: int) -> uuid.UUID:
    """Reserve this user's export slot or raise ``429 EXPORT_RATE_LIMITED``.

    The check and the claim happen under a per-user advisory lock, so two simultaneous
    requests cannot both pass. Commits.
    """
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"account-export:{user_id}"}
    )
    elapsed = await session.scalar(
        select(extract("epoch", func.now() - func.max(Job.created_at))).where(
            Job.user_id == user_id, Job.kind == EXPORT_JOB_KIND
        )
    )
    if elapsed is not None and elapsed < cooldown_seconds:
        retry_after = max(1, int(cooldown_seconds - elapsed) + 1)
        await session.rollback()
        raise AppError(
            429,
            "EXPORT_RATE_LIMITED",
            "You can download your data once per hour. Please try again later.",
            {"retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
    job_id = uuid.uuid4()
    session.add(Job(id=job_id, user_id=user_id, kind=EXPORT_JOB_KIND, status="running", steps=[]))
    await session.commit()
    return job_id


async def finish_export(session: AsyncSession, job_id: uuid.UUID, *, ok: bool) -> None:
    """Mark the export done, or (on failure) release the slot so the user can retry."""
    if ok:
        job = await session.get(Job, job_id)
        if job is not None:
            job.status = "succeeded"
            job.finished_at = datetime.now(UTC)
    else:
        await session.execute(delete(Job).where(Job.id == job_id))
    await session.commit()


def _json(value: Any) -> str:
    return json.dumps(jsonable_encoder(value), ensure_ascii=False, indent=2)


_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def safe_filename(name: str | None) -> str:
    base = os.path.basename((name or "resume").replace("\\", "/")).strip() or "resume"
    cleaned = _UNSAFE.sub("_", base).strip(" .") or "resume"
    stem, dot, ext = cleaned.rpartition(".")
    if dot and len(ext) <= 8:
        return f"{stem[:80]}.{ext}" if stem else cleaned[:80]
    return cleaned[:88]


async def _read_object(storage: StorageBackend, key: str) -> bytes | None:
    try:
        stream = await storage.get_stream(key)
        chunks = [chunk async for chunk in stream]
    except StorageNotFound:
        return None
    return b"".join(chunks)


@dataclass(frozen=True)
class ExportFile:
    path: str
    filename: str


async def build_export_zip(
    session: AsyncSession,
    storage: StorageBackend,
    user_id: str,
    email: str | None,
) -> ExportFile:
    """Write the ZIP to a temp file and return it. The caller deletes the file after sending."""
    resumes = list(
        await session.scalars(
            select(UserResume).where(UserResume.user_id == user_id).order_by(UserResume.created_at, UserResume.file_id)
        )
    )
    jds = list(
        await session.scalars(
            select(UserJd).where(UserJd.user_id == user_id).order_by(UserJd.created_at, UserJd.url_id)
        )
    )
    match_rows = (await session.execute(matching.match_query(user_id))).all()
    generated = list(
        await session.scalars(
            select(GeneratedDocument)
            .join(JobMatchSummary, JobMatchSummary.summary_id == GeneratedDocument.match_id)
            .where(JobMatchSummary.user_id == user_id)
            .order_by(GeneratedDocument.created_at, GeneratedDocument.id)
        )
    )
    transactions = await credits.list_transactions(session, user_id)
    balance = await credits.get_balance(session, user_id)

    handle, path = tempfile.mkstemp(prefix="resumatch-export-", suffix=".zip")
    os.close(handle)
    try:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            write = lambda name, data: asyncio.to_thread(archive.writestr, name, data)  # noqa: E731

            await write(
                "profile.json",
                _json(
                    {
                        "user_id": user_id,
                        "email": email,
                        "credits_balance": balance,
                        "exported_at": datetime.now(UTC),
                    }
                ),
            )

            resume_entries: list[dict[str, Any]] = []
            for row in resumes:
                data = await _read_object(storage, row.storage_key)
                member = None
                if data is not None:
                    member = f"resumes/{row.file_id}-{safe_filename(row.file_name)}"
                    await write(member, data)
                else:
                    logger.warning("Export: object missing for resume %s", row.file_id)
                resume_entries.append(
                    {
                        **documents.resume_out(row).model_dump(),
                        "file_in_export": member,
                        "validation_note": row.reasoning,
                        "extracted_text": row.file_text,
                    }
                )
            await write("resumes.json", _json(resume_entries))
            await write("job_descriptions.json", _json([documents.jd_out(j).model_dump() for j in jds]))
            await write(
                "matches.json",
                _json(
                    [
                        matching.match_out(match, file_name, {"jd_object": jd_object, "jd_url": jd_url}, []).model_dump(
                            exclude={"documents"}
                        )
                        for match, file_name, jd_object, jd_url in match_rows
                    ]
                ),
            )
            await write(
                "generated_documents.json",
                _json([GeneratedDocumentOut.model_validate(d, from_attributes=True).model_dump() for d in generated]),
            )
            await write(
                "credit_transactions.json",
                _json(
                    [
                        CreditTransactionOut(
                            id=t.transaction_id,
                            transaction_type=t.transaction_type,
                            credits_delta=t.credits_delta,
                            reference_id=t.reference_id,
                            name_snapshot=t.name_snapshot,
                            description=t.description,
                            created_at=t.created_at,
                        ).model_dump()
                        for t in transactions
                    ]
                ),
            )
            await write("README.txt", README_TEXT)
    except BaseException:
        os.unlink(path)
        raise

    return ExportFile(path=path, filename=f"resumatch-export-{datetime.now(UTC):%Y%m%d}.zip")


# ── Erase ───────────────────────────────────────────────────────────────────


async def erase_user(
    session: AsyncSession,
    runner: JobRunner,
    storage: StorageBackend,
    settings: Settings,
    user_id: str,
    email: str,
) -> EraseResult:
    cancelled = await runner.cancel_for_user(user_id)

    # Order matters only for readability: every FK here cascades, but deleting explicitly
    # keeps the row counts honest and does not depend on cascade settings.
    deleted: dict[str, int] = {}
    own_matches = select(JobMatchSummary.summary_id).where(JobMatchSummary.user_id == user_id)
    steps = (
        ("generated_documents", delete(GeneratedDocument).where(GeneratedDocument.match_id.in_(own_matches))),
        ("matches", delete(JobMatchSummary).where(JobMatchSummary.user_id == user_id)),
        ("resumes", delete(UserResume).where(UserResume.user_id == user_id)),
        ("job_descriptions", delete(UserJd).where(UserJd.user_id == user_id)),
        ("jobs", delete(Job).where(Job.user_id == user_id)),
        ("credit_transactions", delete(UserCreditTransaction).where(UserCreditTransaction.user_id == user_id)),
        ("credit_accounts", delete(UserCreditAccount).where(UserCreditAccount.user_id == user_id)),
    )
    try:
        for name, statement in steps:
            result = await session.execute(statement)
            deleted[name] = result.rowcount or 0
        await credits.record_deleted_account(session, email, settings)
        await session.commit()
    except BaseException:
        await session.rollback()
        raise

    try:
        objects = await storage.delete_prefix(user_prefix(user_id))
    except StorageError as exc:
        logger.exception("Erase of %s: rows deleted but objects could not be removed", user_id)
        raise AppError(
            502,
            "ERASE_INCOMPLETE",
            "The user's data was erased but some stored files could not be removed. "
            "Retry the request to finish.",
        ) from exc
    logger.info("Erased user %s: %s, %d object(s)", user_id, deleted, objects)
    return EraseResult(user_id=user_id, deleted=deleted, objects_deleted=objects, cancelled_jobs=cancelled)
