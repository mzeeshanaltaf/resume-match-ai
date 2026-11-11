"""Matches and screenings: input checks, the analysis call, the jobs, row -> API converters.

Credit flow (both job kinds): the credits are reserved **before** any AI call, in the same
transaction that creates the job row (``JobRunner.submit(setup=...)``), so an insufficient
balance is a plain ``402`` and nothing else happens. The reservation is recorded in the job's
``meta`` (see :mod:`app.services.reservations`); a failure refunds whatever was not delivered.

A match is delivered when its ``job_match_summary`` row exists; the match id is generated up
front and used as the ledger's ``reference_id``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import GeneratedDocument, JobMatchSummary, UserJd, UserResume
from app.schemas import (
    CandidateMatchReport,
    GeneratedDocumentOut,
    MatchListItem,
    MatchOut,
    Mode,
    RecruiterMatchReport,
)
from app.services import credits, prompts, reservations
from app.services.documents import mode_of
from app.services.jobs import JobContext, error_payload

logger = logging.getLogger(__name__)

MATCH_JOB_KIND = "match"
SCREENING_JOB_KIND = "screening"


# ── Inputs ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class MatchInput:
    """Everything the analysis needs, captured when the request is accepted."""

    match_id: uuid.UUID
    resume_id: uuid.UUID
    file_name: str | None
    resume_text: str
    jd_id: uuid.UUID
    jd_text: str  # flattened with the n8n "Data" node recipe
    job_title: str | None
    company_name: str | None
    is_candidate: bool

    @property
    def mode(self) -> Mode:
        return "candidate" if self.is_candidate else "recruiter"

    @property
    def label(self) -> str:
        """Ledger text, e.g. ``jane.pdf vs Senior Engineer at Acme``."""
        job = self.job_title or "job"
        company = f" at {self.company_name}" if self.company_name else ""
        return f"{self.file_name or 'resume'} vs {job}{company}"


async def load_owned_resume(session: AsyncSession, user_id: str, resume_id: uuid.UUID) -> UserResume:
    row = await session.scalar(
        select(UserResume).where(UserResume.file_id == resume_id, UserResume.user_id == user_id)
    )
    if row is None:
        raise AppError(404, "NOT_FOUND", "Resume not found.", {"resume_id": str(resume_id)})
    return row


async def load_owned_jd(session: AsyncSession, user_id: str, jd_id: uuid.UUID) -> UserJd:
    row = await session.scalar(select(UserJd).where(UserJd.url_id == jd_id, UserJd.user_id == user_id))
    if row is None:
        raise AppError(404, "NOT_FOUND", "Job description not found.", {"jd_id": str(jd_id)})
    return row


def build_match_input(resume: UserResume, jd: UserJd, *, require_mode: Mode | None = None) -> MatchInput:
    """Check the pair is usable for matching and capture its inputs.

    Both documents must be valid (rows are only stored after passing the gate, but the flags
    are checked anyway), have text, and have been added for the same mode (a resume uploaded
    as a candidate is not screened as a recruiter's, and the reverse). ``require_mode`` pins
    the mode (screenings are recruiter-only).
    """
    if resume.is_resume is False:
        raise AppError(422, "INVALID_RESUME", "This file is not a valid resume.", {"resume_id": str(resume.file_id)})
    if jd.is_jd is False or not jd.jd_object:
        raise AppError(422, "INVALID_JD", "This is not a valid job description.", {"jd_id": str(jd.url_id)})
    if not (resume.file_text or "").strip():
        raise AppError(422, "INVALID_RESUME", "This resume has no readable text.", {"resume_id": str(resume.file_id)})

    resume_mode, jd_mode = mode_of(resume.is_candidate), mode_of(jd.is_candidate)
    if resume_mode != jd_mode or (require_mode is not None and resume_mode != require_mode):
        raise AppError(
            422,
            "MODE_MISMATCH",
            "The resume and the job description were added for different uses "
            f"({resume_mode} vs {jd_mode}"
            + (f"; this action needs {require_mode}" if require_mode else "")
            + "). Add them again in the same mode.",
            {
                "resume_id": str(resume.file_id),
                "jd_id": str(jd.url_id),
                "resume_mode": resume_mode,
                "jd_mode": jd_mode,
                "required_mode": require_mode,
            },
        )

    jd_object: dict[str, Any] = jd.jd_object
    return MatchInput(
        match_id=uuid.uuid4(),
        resume_id=resume.file_id,
        file_name=resume.file_name,
        resume_text=resume.file_text or "",
        jd_id=jd.url_id,
        jd_text=prompts.build_job_description_text(jd_object),
        job_title=jd_object.get("job_title"),
        company_name=jd_object.get("company_name"),
        is_candidate=bool(resume.is_candidate),
    )


# ── Reservations ────────────────────────────────────────────────────────────


def match_reservation(item: MatchInput, *, kind_label: str, amount: int) -> dict[str, Any]:
    return reservations.entry(
        item.match_id,
        amount,
        reservations.MATCH,
        name=item.file_name,
        description=f"{kind_label}: {item.label}",
    )


async def reserve_all(
    session: AsyncSession,
    user_id: str,
    entries: list[dict[str, Any]],
    transaction_type: str,
) -> None:
    """Reserve every entry atomically (all or nothing) inside the caller's transaction.

    Raises ``InsufficientCredits`` (402) with the *total* needed and the real balance.
    """
    total = sum(int(e["amount"]) for e in entries)
    balance = await credits.get_balance(session, user_id)
    if balance < total:
        raise credits.InsufficientCredits(needed=total, balance=balance)
    for reservation in entries:
        try:
            await credits.reserve(
                session,
                user_id,
                int(reservation["amount"]),
                transaction_type,
                reference_id=uuid.UUID(reservation["reference_id"]),
                name_snapshot=reservation["name"],
                description=reservation["description"],
            )
        except credits.InsufficientCredits:
            # Lost a race with another spend between the pre-check and here.
            await session.rollback()
            raise credits.InsufficientCredits(
                needed=total, balance=await credits.get_balance(session, user_id)
            ) from None


# ── The analysis ────────────────────────────────────────────────────────────


def _clamp_score(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("match_summary") or {}
    score = summary.get("overall_score_percent")
    if isinstance(score, (int, float)):
        summary["overall_score_percent"] = max(0, min(100, int(round(score))))
    return report


async def analyze(llm: Any, item: MatchInput) -> dict[str, Any]:
    """One model call; the candidate or recruiter prompt by mode. Returns the report dict
    exactly as it is stored in ``job_match_summary.job_match_summary``."""
    if item.is_candidate:
        report = await llm.parse(
            "match",
            instructions=prompts.CANDIDATE_MATCH_INSTRUCTIONS,
            input=prompts.candidate_match_input(item.resume_text, item.jd_text),
            schema=CandidateMatchReport,
        )
    else:
        report = await llm.parse(
            "match",
            instructions=prompts.RECRUITER_MATCH_INSTRUCTIONS,
            input=prompts.recruiter_match_input(item.resume_text, item.jd_text),
            schema=RecruiterMatchReport,
        )
    return _clamp_score(report.model_dump(mode="json"))


async def save_match(ctx: JobContext, item: MatchInput, report: dict[str, Any]) -> JobMatchSummary:
    row = JobMatchSummary(
        summary_id=item.match_id,
        url_id=item.jd_id,
        user_id=ctx.user_id,
        file_id=item.resume_id,
        is_candidate=item.is_candidate,
        job_match_summary=report,
    )
    try:
        async with ctx.sessionmaker() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
    except IntegrityError as exc:  # the resume or job description was deleted while we worked
        raise AppError(
            409,
            "SOURCE_DELETED",
            "The resume or the job description was deleted while the analysis ran.",
        ) from exc
    return row


# ── Jobs ────────────────────────────────────────────────────────────────────


async def run_match(ctx: JobContext, *, item: MatchInput, llm: Any) -> dict[str, Any]:
    async with ctx.step("analyzing", "Analyzing your resume against the job"):
        report = await analyze(llm, item)
    async with ctx.step("saving", "Saving the report"):
        row = await save_match(ctx, item, report)
    out = match_out(row, item.file_name, _jd_fields(item), documents=[])
    return {"match_id": str(item.match_id), "match": out.model_dump(mode="json")}


def _jd_fields(item: MatchInput) -> dict[str, Any]:
    return {"jd_object": {"job_title": item.job_title, "company_name": item.company_name}, "jd_url": None}


async def run_screening(
    ctx: JobContext,
    *,
    jd_id: uuid.UUID,
    items: list[MatchInput],
    llm: Any,
    settings: Settings,
) -> dict[str, Any]:
    """Score every resume against one job (recruiter prompt), a few at a time.

    Each resume is a step (``score:<resume_id>``) so the client sees per-resume progress. An
    item that fails is refunded on the spot and reported in ``failed``; the others are kept.
    The job fails only if every item failed.
    """
    semaphore = asyncio.Semaphore(settings.screening_concurrency)
    reservation_by_match = {r["reference_id"]: r for r in ctx.meta.get("reservations", [])}

    async def score(item: MatchInput) -> tuple[MatchInput, dict[str, Any] | None, dict[str, Any] | None]:
        async with semaphore:
            try:
                async with ctx.step(f"score:{item.resume_id}", f"Scoring {item.file_name or 'resume'}"):
                    report = await analyze(llm, item)
                    await save_match(ctx, item, report)
                return item, report, None
            except AppError as exc:
                error = error_payload(exc)
            except Exception:
                logger.exception("Screening item %s crashed", item.resume_id)
                error = {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side.", "details": None}
            # Failed item: give its credit back now (idempotent; commit independently).
            async with ctx.sessionmaker() as session:
                await reservations.refund_entry(session, ctx.user_id, reservation_by_match[str(item.match_id)])
                await session.commit()
            return item, None, error

    outcomes = await asyncio.gather(*(score(item) for item in items))

    scored = [(item, report) for item, report, _ in outcomes if report is not None]
    failed = [
        {"resume_id": str(item.resume_id), "file_name": item.file_name, "error": error}
        for item, _, error in outcomes
        if error is not None
    ]
    if not scored:
        raise AppError(
            502,
            "SCREENING_FAILED",
            "None of the resumes could be analyzed. Your credits were refunded.",
            {"failed": failed},
        )

    async with ctx.step("ranking", "Ranking the candidates"):
        # Highest score first; ties keep the order the resumes were submitted in (stable sort).
        scored.sort(key=lambda pair: pair[1]["match_summary"]["overall_score_percent"], reverse=True)
        ranked = [
            {
                "rank": position,
                "match_id": str(item.match_id),
                "resume_id": str(item.resume_id),
                "file_name": item.file_name,
                "overall_score_percent": report["match_summary"]["overall_score_percent"],
                "score_confidence": report["match_summary"]["score_confidence"],
                "rationale": report["match_summary"].get("rationale", ""),
            }
            for position, (item, report) in enumerate(scored, start=1)
        ]
    refunded = sum(int(reservation_by_match[str(item.match_id)]["amount"]) for item, _, error in outcomes if error)
    return {"jd_id": str(jd_id), "ranked": ranked, "failed": failed, "refunded_credits": refunded}


# ── Row -> API ──────────────────────────────────────────────────────────────


def _summary_fields(report: dict[str, Any] | None) -> tuple[int | None, str | None]:
    summary = (report or {}).get("match_summary") or {}
    return summary.get("overall_score_percent"), summary.get("score_confidence")


def match_list_item(
    row: JobMatchSummary, file_name: str | None, jd_object: dict[str, Any] | None, jd_url: str | None
) -> MatchListItem:
    score, confidence = _summary_fields(row.job_match_summary)
    jd_object = jd_object or {}
    return MatchListItem(
        id=row.summary_id,
        resume_id=row.file_id,
        jd_id=row.url_id,
        mode=mode_of(row.is_candidate),
        resume_file_name=file_name,
        job_title=jd_object.get("job_title"),
        company_name=jd_object.get("company_name"),
        jd_url=jd_url,
        overall_score_percent=score,
        score_confidence=confidence,
        created_at=row.created_at,
    )


def match_out(
    row: JobMatchSummary,
    file_name: str | None,
    jd: dict[str, Any],
    documents: list[GeneratedDocument],
) -> MatchOut:
    base = match_list_item(row, file_name, jd.get("jd_object"), jd.get("jd_url"))
    report = row.job_match_summary or {}
    return MatchOut(
        **base.model_dump(),
        report=report,
        documents=[GeneratedDocumentOut.model_validate(d, from_attributes=True) for d in documents],
    )


def match_query(user_id: str):  # type: ignore[no-untyped-def]
    """``(match, resume file name, jd_object, jd_url)`` rows for one user, newest first."""
    return (
        select(JobMatchSummary, UserResume.file_name, UserJd.jd_object, UserJd.jd_url)
        .join(UserResume, UserResume.file_id == JobMatchSummary.file_id)
        .outerjoin(UserJd, UserJd.url_id == JobMatchSummary.url_id)
        .where(JobMatchSummary.user_id == user_id)
        .order_by(JobMatchSummary.created_at.desc(), JobMatchSummary.summary_id)
    )
