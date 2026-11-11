"""Test doubles for OpenAI (our wrapper's interface) and Firecrawl, plus document builders."""

from __future__ import annotations

import io
from collections.abc import Callable
from types import SimpleNamespace as NS
from typing import Any

from app.errors import AppError
from app.schemas import JdExtraction
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
