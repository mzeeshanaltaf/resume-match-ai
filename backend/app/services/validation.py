"""Decisions API gate: is this document really a resume / a job posting?

One ``POST /v1/decisions`` request per document, two questions (see ``prompts``):

* ``predicate``: probability that the text is a resume (or a posting for one specific
  open job). Accepted only when ``probability >= DECISION_MIN_PROBABILITY``.
* ``choice``: what the document actually is. Used only to word the rejection ("This looks
  like a cover letter, not a resume"), because the Decisions API returns no free text.

A refusal answer (to either question) counts as a rejection. A rejected document raises
``422 INVALID_RESUME`` / ``422 INVALID_JD`` and is never stored. An upstream failure is
*not* a rejection: it raises the LLM error (502/504) so the user can retry.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from app.config import Settings
from app.errors import AppError
from app.services import prompts

logger = logging.getLogger(__name__)

DocKind = Literal["resume", "jd"]


@dataclass(frozen=True)
class GateResult:
    accepted: bool
    probability: float | None  # None when the model refused the predicate
    detected_type: str | None
    refused: bool = False

    def note(self, kind: DocKind) -> str:
        """Short human-readable record kept in the DB (``reasoning`` / ``validation_note``)."""
        label = "resume" if kind == "resume" else "job description"
        if self.probability is None:
            return f"Model declined to classify the document as a {label}."
        verdict = "Accepted" if self.accepted else "Rejected"
        seen = f"; looks like: {self.detected_type}" if self.detected_type else ""
        return f"{verdict} as {label} (probability {self.probability:.2f}{seen})."


_RESUME_REJECTIONS = {
    "job_description": "This looks like a job description, not a resume.",
    "cover_letter": "This looks like a cover letter, not a resume.",
    "article_or_blog": "This looks like an article or blog post, not a resume.",
    "company_page": "This looks like a company page, not a resume.",
}
_RESUME_GENERIC = (
    "This doesn't look like a resume or CV. Upload a resume that lists your experience, "
    "education and skills."
)

_JD_REJECTIONS = {
    "resume": "This looks like a resume, not a job description.",
    "cover_letter": "This looks like a cover letter, not a job description.",
    "article_or_blog": "This looks like an article or blog post, not a job posting.",
    "company_page": "This looks like a company page, not a posting for one specific job.",
}
_JD_GENERIC = (
    "This doesn't look like a posting for one specific open job. Use a link to, or the text "
    "of, a single job posting."
)


def rejection_message(kind: DocKind, result: GateResult) -> str:
    if result.refused or result.probability is None:
        return (
            "We couldn't evaluate this document. Make sure it contains only a "
            f"{'resume' if kind == 'resume' else 'job posting'}."
        )
    table, generic = (
        (_RESUME_REJECTIONS, _RESUME_GENERIC) if kind == "resume" else (_JD_REJECTIONS, _JD_GENERIC)
    )
    return table.get(result.detected_type or "", generic)


def _answer(answers: list[Any], index: int, name: str) -> Any | None:
    """The answer for a question: by name when the API echoes it, else by position."""
    for answer in answers:
        if getattr(answer, "name", None) == name:
            return answer
    return answers[index] if index < len(answers) else None


def interpret(answers: list[Any], min_probability: float, predicate_name: str) -> GateResult:
    predicate = _answer(answers, 0, predicate_name)
    choice = _answer(answers, 1, "document_type")

    refused = any(getattr(a, "type", None) == "refusal" for a in (predicate, choice) if a is not None)
    probability = (
        float(predicate.probability) if getattr(predicate, "type", None) == "predicate" else None
    )
    detected = getattr(choice, "choice", None) if getattr(choice, "type", None) == "choice" else None
    detected_type = detected if isinstance(detected, str) else None

    accepted = (not refused) and probability is not None and probability >= min_probability
    return GateResult(accepted, probability, detected_type, refused)


async def _gate(
    kind: DocKind,
    text: str,
    llm: Any,
    settings: Settings,
) -> GateResult:
    if kind == "resume":
        questions, predicate_name = prompts.resume_gate_questions(), "is_resume"
    else:
        questions, predicate_name = prompts.jd_gate_questions(), "is_job_description"

    decision = await llm.decide(input=text, questions=questions)
    result = interpret(list(decision.answers), settings.decision_min_probability, predicate_name)
    logger.info(
        "Validation gate (%s): accepted=%s probability=%s type=%s",
        kind,
        result.accepted,
        result.probability,
        result.detected_type,
    )
    if not result.accepted:
        code = "INVALID_RESUME" if kind == "resume" else "INVALID_JD"
        raise AppError(
            422,
            code,
            rejection_message(kind, result),
            {
                "detected_type": result.detected_type,
                "probability": result.probability,
                "threshold": settings.decision_min_probability,
            },
        )
    return result


async def validate_resume(text: str, llm: Any, settings: Settings) -> GateResult:
    """Raise ``422 INVALID_RESUME`` unless ``text`` is accepted as a resume."""
    return await _gate("resume", text, llm, settings)


async def validate_jd(text: str, llm: Any, settings: Settings) -> GateResult:
    """Raise ``422 INVALID_JD`` unless ``text`` is accepted as a job posting."""
    return await _gate("jd", text, llm, settings)
