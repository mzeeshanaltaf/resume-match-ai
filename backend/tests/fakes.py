"""Test doubles for OpenAI (our wrapper's interface) and Firecrawl, plus document builders."""

from __future__ import annotations

import io
from collections.abc import Awaitable, Callable
from types import SimpleNamespace as NS
from typing import Any

from app.errors import AppError
from app.schemas import (
    AtsOptimization,
    CandidateMatchReport,
    CandidateMatchSummary,
    CoverLetterOutput,
    CriticalGap,
    DetailedAnalysis,
    GapWeakMatch,
    ImprovementSuggestion,
    ImprovementSuggestions,
    JdExtraction,
    KeyStrength,
    KeywordToAdd,
    RecruiterMatchReport,
    RecruiterMatchSummary,
    RequirementMet,
    SectionRecommendation,
    SkillToRephrase,
    TailoredBullet,
    TailoredBulletsOutput,
    TailoredExperience,
)
from app.services.scraping import ScrapedPage

RESUME_TEXT = (
    "Jane Candidate\njane@example.com | +1 555 0100 | Berlin\n\n"
    "SUMMARY\nBackend engineer with six years of experience building APIs.\n\n"
    "EXPERIENCE\nSenior Engineer, Acme Corp (2020 - 2025)\n- Led a team of four.\n"
    "- Built payment services in Python.\n\nEDUCATION\nBSc Computer Science, TU Berlin, 2018\n\n"
    "SKILLS\nPython, PostgreSQL, Docker"
)

JD_TEXT = (
    "Senior Backend Engineer at Acme Corp. Location: Berlin (hybrid). Full-time.\n"
    "Responsibilities: design and run APIs. Requirements: 5+ years Python, PostgreSQL."
)


def unique_resume_text(n: int) -> str:
    return RESUME_TEXT + f"\nReference number {n}"


# ── Document builders ───────────────────────────────────────────────────────


def make_pdf(pages: int = 1, text: str = RESUME_TEXT) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for _ in range(pages):
        page = doc.new_page()
        y = 60
        for line in text.split("\n"):
            page.insert_text((50, y), line, fontsize=9)
            y += 12
    data = doc.tobytes()
    doc.close()
    return data


def make_scanned_pdf(pages: int = 1) -> bytes:
    """A PDF whose pages are only an image: no text layer."""
    import pymupdf

    doc = pymupdf.open()
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 120, 160))
    pixmap.clear_with(210)
    for _ in range(pages):
        page = doc.new_page()
        page.insert_image(pymupdf.Rect(50, 50, 300, 350), pixmap=pixmap)
    data = doc.tobytes()
    doc.close()
    return data


def make_password_pdf() -> bytes:
    import pymupdf

    doc = pymupdf.open()
    doc.new_page().insert_text((50, 60), RESUME_TEXT, fontsize=9)
    data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="user")
    doc.close()
    return data


def make_docx(
    text: str = RESUME_TEXT, *, pages_property: int | None = None, drop_app_xml: bool = False
) -> bytes:
    """A DOCX. python-docx's template carries ``docProps/app.xml`` with ``Pages`` = 1;
    ``pages_property`` rewrites it (as Word would) and ``drop_app_xml`` removes it."""
    import zipfile

    from docx import Document

    doc = Document()
    for line in text.split("\n"):
        doc.add_paragraph(line)
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Languages"
    table.rows[0].cells[1].text = "English, German"
    buffer = io.BytesIO()
    doc.save(buffer)
    data = buffer.getvalue()
    if pages_property is None and not drop_app_xml:
        return data

    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            if item.filename != "docProps/app.xml":
                dst.writestr(item, src.read(item.filename))
        if pages_property is not None:
            dst.writestr(
                "docProps/app.xml",
                f'<?xml version="1.0"?><Properties><Pages>{pages_property}</Pages></Properties>',
            )
    return out.getvalue()


# ── Decisions answers ───────────────────────────────────────────────────────


def predicate_answer(probability: float, name: str) -> Any:
    return NS(type="predicate", name=name, probability=probability)


def choice_answer(value: str, name: str = "document_type") -> Any:
    return NS(type="choice", name=name, choice=value, confidence=0.9, probabilities=[])


def refusal_answer(name: str) -> Any:
    return NS(type="refusal", name=name)


# ── Canned model outputs ────────────────────────────────────────────────────


def candidate_report(score: int = 82) -> CandidateMatchReport:
    suggestion = ImprovementSuggestion(
        suggestion="Quantify the payment-service work",
        example_phrasing="Built payment services handling 2M requests/day",
        expected_impact="Shows scale",
        effort_required="low",
    )
    return CandidateMatchReport(
        match_summary=CandidateMatchSummary(
            overall_score_percent=score,
            score_confidence="high",
            key_strengths=[
                KeyStrength(strength="Python", evidence="Built payment services in Python", jd_alignment="5+ years Python")
            ],
            critical_gaps=[
                CriticalGap(
                    gap="No Kubernetes",
                    jd_requirement="Kubernetes experience",
                    impact_level="medium",
                    remediation_difficulty="moderate",
                )
            ],
        ),
        detailed_analysis=DetailedAnalysis(
            requirements_met=[
                RequirementMet(
                    jd_requirement="5+ years Python",
                    requirement_type="must_have",
                    resume_evidence="Six years of backend experience",
                    match_quality="strong",
                    notes=None,
                )
            ],
            gaps_and_weak_matches=[
                GapWeakMatch(
                    jd_requirement="Kubernetes experience",
                    requirement_type="preferred",
                    current_status="Not mentioned",
                    impact_level="medium",
                    suggested_action="Add any container orchestration exposure",
                )
            ],
        ),
        improvement_suggestions=ImprovementSuggestions(
            high_priority=[suggestion], medium_priority=[], nice_to_have=[]
        ),
        ats_optimization=AtsOptimization(
            keywords_to_add=[
                KeywordToAdd(keyword="Kubernetes", context_suggestion="Skills", frequency_recommendation="1x")
            ],
            skills_to_rephrase=[
                SkillToRephrase(current_phrase="APIs", suggested_rephrase="REST APIs", reason="ATS keyword")
            ],
            section_recommendations=[
                SectionRecommendation(section="Skills", recommendation="List tools", rationale="Parsing")
            ],
        ),
    )


def recruiter_report(score: int = 82) -> RecruiterMatchReport:
    return RecruiterMatchReport(
        match_summary=RecruiterMatchSummary(
            overall_score_percent=score,
            score_confidence="medium",
            rationale="Strong Python and API background; no Kubernetes mentioned.",
        )
    )


TAILORED_BULLETS = TailoredBulletsOutput(
    summary="Backend engineer with six years building payment APIs in Python.",
    experience=[
        TailoredExperience(
            heading="Senior Engineer, Acme Corp",
            bullets=[
                TailoredBullet(
                    original="Built payment services in Python.",
                    rewritten="Built and ran Python payment services behind the company's APIs.",
                    why="Mirrors the job's API focus.",
                )
            ],
        )
    ],
    skills_to_emphasize=["Python", "PostgreSQL"],
    notes=None,
)

COVER_LETTER = CoverLetterOutput(
    salutation="Dear Acme hiring team,",
    paragraphs=["I am applying for the Senior Backend Engineer role.", "I have built payment APIs in Python."],
    closing="Kind regards,",
    signature="Jane Candidate",
)


# ── Fakes ───────────────────────────────────────────────────────────────────


class FakeLLM:
    """Stands in for ``LLMService``: same ``decide`` / ``parse`` / ``text`` interface."""

    def __init__(self) -> None:
        self.resume_probability = 0.95
        self.resume_type = "resume"
        self.jd_probability = 0.95
        self.jd_type = "job_description"
        self.ocr_text = RESUME_TEXT
        self.extraction = JdExtraction(
            job_title="Senior Backend Engineer",
            company_name="Acme Corp",
            location="Berlin",
            employment_type="Full-time",
            description="Build APIs.",
            responsibilities=["Design APIs"],
            requirements=["5+ years Python"],
            benefits=[],
        )
        self.match_score = 82
        # Score by the prompt input (recruiter inputs contain the resume text).
        self.score_for: Callable[[Any], int] | None = None
        # Awaited before every `parse` answer: sleep to hold a job open, raise to fail it.
        self.parse_hook: Callable[[str, type, Any], Awaitable[None]] | None = None
        self.answers_override: Callable[[list[dict[str, Any]]], list[Any]] | None = None
        self.error: AppError | None = None  # raised by every call when set
        self.decide_calls: list[dict[str, Any]] = []
        self.text_calls: list[dict[str, Any]] = []
        self.parse_calls: list[dict[str, Any]] = []

    async def decide(self, *, input: str, questions: list[dict[str, Any]]) -> Any:
        self.decide_calls.append({"input": input, "questions": questions})
        if self.error:
            raise self.error
        if self.answers_override:
            return NS(answers=self.answers_override(questions))
        predicate_name = questions[0]["name"]
        if predicate_name == "is_resume":
            probability, kind = self.resume_probability, self.resume_type
        else:
            probability, kind = self.jd_probability, self.jd_type
        return NS(answers=[predicate_answer(probability, predicate_name), choice_answer(kind)])

    async def text(self, task: str, *, instructions: str | None = None, input: Any) -> str:
        self.text_calls.append({"task": task, "instructions": instructions, "input": input})
        if self.error:
            raise self.error
        return self.ocr_text

    async def parse(self, task: str, *, instructions: str, input: Any, schema: type) -> Any:
        self.parse_calls.append({"task": task, "instructions": instructions, "input": input, "schema": schema})
        if self.error:
            raise self.error
        if self.parse_hook:
            await self.parse_hook(task, schema, input)  # may sleep or raise AppError
        if schema is CandidateMatchReport:
            return candidate_report(self.score_for(input) if self.score_for else self.match_score)
        if schema is RecruiterMatchReport:
            return recruiter_report(self.score_for(input) if self.score_for else self.match_score)
        if schema is TailoredBulletsOutput:
            return TAILORED_BULLETS
        if schema is CoverLetterOutput:
            return COVER_LETTER
        return self.extraction


class FakeFirecrawl:
    def __init__(self) -> None:
        self.page = ScrapedPage(text=JD_TEXT, title="Senior Backend Engineer")
        self.error: AppError | None = None
        self.urls: list[str] = []

    async def scrape(self, url: str) -> ScrapedPage:
        self.urls.append(url)
        if self.error:
            raise self.error
        return self.page
