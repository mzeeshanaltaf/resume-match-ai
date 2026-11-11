"""SQLAlchemy models for the ``resume_match`` schema (target shape after migration 0002).

Table and column names are the ones n8n created and the live schema still has, so the
reshape is additive/corrective rather than a rename. Better Auth's tables (``user``,
``session``, ``account``, ``verification``, ``jwks``) are deliberately not modelled
here and are never touched by Alembic.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import DateTime

SCHEMA = "resume_match"

# Transaction types allowed by the CHECK constraint on user_credit_transactions.
CREDIT_TRANSACTION_TYPES: tuple[str, ...] = (
    "signup_bonus",
    "resume_processing",
    "jd_processing",
    "refund",
    "manual_adjustment",
    "match_analysis",
    "screening",
    "cover_letter",
)
JOB_STATUSES: tuple[str, ...] = ("queued", "running", "succeeded", "failed")
GENERATED_DOCUMENT_KINDS: tuple[str, ...] = ("tailored_bullets", "cover_letter")


def _in_list(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


_now = text("now()")
_uuid = text("gen_random_uuid()")


def _created_at() -> Mapped[datetime | None]:
    return mapped_column(DateTime(timezone=True), server_default=_now)


def _updated_at() -> Mapped[datetime | None]:
    return mapped_column(DateTime(timezone=True), server_default=_now, onupdate=func.now())


class UserResume(Base):
    __tablename__ = "user_resume"
    __table_args__ = (
        UniqueConstraint("user_id", "checksum", name="uq_user_resume_user_id_checksum"),
        Index("idx_user_resume_user_id", "user_id"),
    )

    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=_uuid)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str | None] = mapped_column(Text)
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    mime_type: Mapped[str | None] = mapped_column(Text)
    num_pages: Mapped[int | None] = mapped_column(Integer)
    num_characters: Mapped[int | None] = mapped_column(Integer)
    num_words: Mapped[int | None] = mapped_column(Integer)
    is_scanned: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    is_resume: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    is_candidate: Mapped[bool | None] = mapped_column(Boolean)
    reasoning: Mapped[str | None] = mapped_column(Text)
    # Object-store key, e.g. resumes/{user_id}/{file_id}. Replaces file_binary_data.
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    file_text: Mapped[str | None] = mapped_column(Text)
    checksum: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = _created_at()
    updated_at: Mapped[datetime | None] = _updated_at()


class UserJd(Base):
    __tablename__ = "user_jds"
    __table_args__ = (
        UniqueConstraint("user_id", "checksum", name="uq_user_jds_user_id_checksum"),
        Index("idx_user_jds_user_id", "user_id"),
    )

    url_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=_uuid)
    jd_url: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    is_candidate: Mapped[bool | None] = mapped_column(Boolean)
    is_jd: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    validation_note: Mapped[str | None] = mapped_column(Text)
    jd_object: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    checksum: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = _created_at()
    updated_at: Mapped[datetime | None] = _updated_at()


class JobMatchSummary(Base):
    __tablename__ = "job_match_summary"
    __table_args__ = (
        Index("ix_job_match_summary_user_id_created_at", "user_id", "created_at"),
    )

    summary_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=_uuid)
    url_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.user_jds.url_id", ondelete="CASCADE", name="fk_job_match_summary_url_id"),
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.user_resume.file_id", ondelete="CASCADE", name="fk_job_match_summary_file_id"),
        nullable=False,
    )
    is_candidate: Mapped[bool | None] = mapped_column(Boolean)
    job_match_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime | None] = _created_at()
    updated_at: Mapped[datetime | None] = _updated_at()


class UserCreditAccount(Base):
    __tablename__ = "user_credit_accounts"
    __table_args__ = (
        CheckConstraint("current_balance >= 0", name="user_credit_accounts_current_balance_check"),
        # Redundant with the primary key, but it exists in production; kept so the models
        # describe the real schema.
        Index("idx_user_credit_accounts_user_id", "user_id"),
    )

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    current_balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime | None] = _created_at()
    updated_at: Mapped[datetime | None] = _updated_at()


class UserCreditTransaction(Base):
    __tablename__ = "user_credit_transactions"
    __table_args__ = (
        CheckConstraint("credits_delta <> 0", name="user_credit_transactions_credits_delta_check"),
        CheckConstraint(
            _in_list("transaction_type", CREDIT_TRANSACTION_TYPES),
            name="user_credit_transactions_transaction_type_check",
        ),
    )

    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=_uuid
    )
    user_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey(f"{SCHEMA}.user_credit_accounts.user_id", ondelete="CASCADE", name="fk_credit_user"),
        nullable=False,
    )
    transaction_type: Mapped[str] = mapped_column(Text, nullable=False)
    credits_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    name_snapshot: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = _created_at()


class DeletedAccount(Base):
    """Salted hash of an erased account's email, so re-registering starts at 0 credits."""

    __tablename__ = "deleted_accounts"

    email_hash: Mapped[str] = mapped_column(Text, primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=_now
    )


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(_in_list("status", JOB_STATUSES), name="jobs_status_check"),
        Index("ix_jobs_user_id_created_at", "user_id", "created_at"),
        Index("ix_jobs_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=_uuid)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    steps: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # {"code", "message", "details"} (same shape as API errors) when status = failed.
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Internal bookkeeping, never exposed by the API (e.g. the credit reservations a job
    # made, so a failure or restart can refund them).
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=_now, onupdate=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"
    __table_args__ = (
        CheckConstraint(_in_list("kind", GENERATED_DOCUMENT_KINDS), name="generated_documents_kind_check"),
        Index("ix_generated_documents_match_id", "match_id"),
        # Tailored bullets are included in the match credit: at most one per match.
        Index(
            "uq_generated_documents_bullets_per_match",
            "match_id",
            unique=True,
            postgresql_where=text("kind = 'tailored_bullets'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=_uuid)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            f"{SCHEMA}.job_match_summary.summary_id",
            ondelete="CASCADE",
            name="fk_generated_documents_match_id",
        ),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=_now
    )
