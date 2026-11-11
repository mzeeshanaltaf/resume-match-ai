"""The migrated database matches the models and implements master plan Part 2."""

from __future__ import annotations

import uuid

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.models import (
    Base,
    GeneratedDocument,
    Job,
    JobMatchSummary,
    UserCreditAccount,
    UserCreditTransaction,
    UserJd,
    UserResume,
)


async def test_models_and_migrations_agree(engine: AsyncEngine) -> None:
    def _diff(sync_conn) -> list:
        ctx = MigrationContext.configure(
            sync_conn,
            opts={
                "include_schemas": True,
                "include_object": lambda obj, name, type_, reflected, compare_to: (
                    name in {t.name for t in Base.metadata.tables.values()}
                    if type_ == "table" and reflected
                    else True
                ),
                "version_table_schema": "resume_match",
            },
        )
        return compare_metadata(ctx, Base.metadata)

    # Reflect through an engine whose default schema is NOT resume_match (no search_path
    # override), so schema-qualified model names compare equal to what is reflected.
    plain = create_async_engine(engine.url, poolclass=NullPool)
    try:
        async with plain.connect() as conn:
            diff = await conn.run_sync(_diff)
    finally:
        await plain.dispose()
    assert diff == []


async def _seed(session: AsyncSession) -> tuple[UserResume, UserJd, JobMatchSummary]:
    resume = UserResume(user_id="u1", storage_key="resumes/u1/f1", checksum="c-resume")
    jd = UserJd(user_id="u1", checksum="c-jd", jd_object={"title": "Engineer"})
    session.add_all([resume, jd])
    await session.flush()
    match = JobMatchSummary(
        user_id="u1", file_id=resume.file_id, url_id=jd.url_id, job_match_summary={"score": 80}
    )
    session.add(match)
    await session.flush()
    return resume, jd, match


async def test_checksum_unique_per_user_not_globally(session: AsyncSession) -> None:
    session.add(UserResume(user_id="u1", storage_key="k1", checksum="same"))
    session.add(UserResume(user_id="u2", storage_key="k2", checksum="same"))
    session.add(UserJd(user_id="u1", checksum="same"))
    session.add(UserJd(user_id="u2", checksum="same"))
    await session.commit()

    session.add(UserResume(user_id="u1", storage_key="k3", checksum="same"))
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()

    session.add(UserJd(user_id="u1", checksum="same"))
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_storage_key_is_required_and_binary_column_is_gone(
    session: AsyncSession, engine: AsyncEngine
) -> None:
    session.add(UserResume(user_id="u1", checksum="x"))  # no storage_key
    with pytest.raises(IntegrityError):
        await session.commit()
    async with engine.connect() as conn:
        cols = {
            r[0]
            for r in await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='resume_match' AND table_name='user_resume'"
                )
            )
        }
    assert "file_binary_data" not in cols
    assert "storage_key" in cols


async def test_deleting_a_match_keeps_resume_and_jd(session: AsyncSession) -> None:
    resume, jd, match = await _seed(session)
    await session.commit()
    await session.delete(match)
    await session.commit()
    assert await session.get(UserResume, resume.file_id) is not None
    assert await session.get(UserJd, jd.url_id) is not None


async def test_deleting_resume_or_jd_cascades_to_matches_and_documents(session: AsyncSession) -> None:
    resume, jd, match = await _seed(session)
    session.add(GeneratedDocument(match_id=match.summary_id, kind="cover_letter", content={"t": "x"}))
    await session.commit()

    await session.execute(text("DELETE FROM resume_match.user_resume WHERE file_id = :f"), {"f": resume.file_id})
    await session.commit()
    assert (await session.scalars(select(JobMatchSummary))).all() == []
    assert (await session.scalars(select(GeneratedDocument))).all() == []

    resume2, jd2, match2 = await _seed_second(session)
    await session.execute(text("DELETE FROM resume_match.user_jds WHERE url_id = :j"), {"j": jd2.url_id})
    await session.commit()
    assert (await session.scalars(select(JobMatchSummary))).all() == []


async def _seed_second(session: AsyncSession) -> tuple[UserResume, UserJd, JobMatchSummary]:
    resume = UserResume(user_id="u1", storage_key="resumes/u1/f2", checksum="c-resume-2")
    jd = UserJd(user_id="u1", checksum="c-jd-2")
    session.add_all([resume, jd])
    await session.flush()
    match = JobMatchSummary(user_id="u1", file_id=resume.file_id, url_id=jd.url_id)
    session.add(match)
    await session.commit()
    return resume, jd, match


async def test_match_requires_existing_resume_and_jd(session: AsyncSession) -> None:
    session.add(JobMatchSummary(user_id="u1", file_id=uuid.uuid4()))
    with pytest.raises(IntegrityError):
        await session.commit()


@pytest.mark.parametrize("kind", ["match_analysis", "screening", "cover_letter", "refund"])
async def test_ledger_accepts_new_and_existing_types(session: AsyncSession, kind: str) -> None:
    session.add(UserCreditAccount(user_id="u1", current_balance=5))
    await session.flush()
    session.add(UserCreditTransaction(user_id="u1", transaction_type=kind, credits_delta=-1))
    await session.commit()


async def test_ledger_rejects_unknown_type_zero_delta_and_negative_balance(session: AsyncSession) -> None:
    session.add(UserCreditAccount(user_id="u1", current_balance=5))
    await session.commit()

    for bad in (
        UserCreditTransaction(user_id="u1", transaction_type="bogus", credits_delta=-1),
        UserCreditTransaction(user_id="u1", transaction_type="refund", credits_delta=0),
    ):
        session.add(bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

    session.add(UserCreditAccount(user_id="u2", current_balance=-1))
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_jobs_and_generated_documents_constraints(session: AsyncSession) -> None:
    job = Job(user_id="u1", kind="resume_upload")
    session.add(job)
    await session.commit()
    assert (job.status, job.steps) == ("queued", [])

    session.add(Job(user_id="u1", kind="x", status="exploded"))
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()

    _, _, match = await _seed(session)
    session.add(GeneratedDocument(match_id=match.summary_id, kind="poem", content={}))
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_version_table_lives_in_resume_match(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        version = await conn.scalar(text("SELECT version_num FROM resume_match.alembic_version"))
        in_public = await conn.scalar(text("SELECT to_regclass('public.alembic_version')"))
    assert version == "0002_reshape_for_fastapi"
    assert in_public is None
