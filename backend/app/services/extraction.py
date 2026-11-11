"""Turn uploaded bytes into text: type detection, page counts, extraction, vision OCR.

Layered so the cheap checks run first and an unusable file is refused before any
extraction or AI call:

1. :func:`inspect_file`  - type by **magic bytes** (never the client MIME type or the file
   extension), readability, page count and the page limit.  Fast; run it inline.
2. :func:`extract_text`  - PDF text layer (PyMuPDF), DOCX (python-docx) or TXT.
3. :func:`transcribe_scanned_pdf` - when a PDF's text layer is shorter than
   ``SCANNED_PDF_MIN_CHARS``, render each page with PyMuPDF and have the vision model
   transcribe it (replaces the old Mistral OCR step).

PyMuPDF is not thread-safe, so every call into it holds one process-wide lock; the CPU
work itself runs in a worker thread so the event loop stays responsive.
"""

from __future__ import annotations

import asyncio
import io
import re
import threading
import zipfile
from dataclasses import dataclass
from typing import Any, Literal

from app.config import Settings
from app.errors import AppError
from app.services import prompts
from app.services.llm import image_input

Kind = Literal["pdf", "docx", "txt"]

MIME_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
}

_PYMUPDF_LOCK = threading.Lock()
_PAGES_RE = re.compile(rb"<Pages>\s*(\d+)\s*</Pages>")
_APP_XML_MAX_BYTES = 64 * 1024
_TEXT_SAMPLE_BYTES = 8192
_MAX_CONTROL_CHAR_RATIO = 0.02


@dataclass(frozen=True)
class FileInfo:
    kind: Kind
    mime_type: str
    # None when the format does not carry a page count (TXT, DOCX not saved by Word).
    num_pages: int | None


@dataclass(frozen=True)
class ExtractedText:
    text: str
    is_scanned: bool = False


def _unreadable(message: str) -> AppError:
    return AppError(422, "UNREADABLE_DOCUMENT", message)


# ── Type detection ──────────────────────────────────────────────────────────


def _is_pdf(data: bytes) -> bool:
    # The spec allows junk before the header, within the first 1024 bytes.
    return b"%PDF-" in data[:1024]


def _decode_text(data: bytes) -> str:
    if data.startswith(b"\xef\xbb\xbf"):
        return data[3:].decode("utf-8", errors="replace")
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def _looks_like_text(data: bytes) -> bool:
    sample = data[:_TEXT_SAMPLE_BYTES]
    is_utf16 = sample.startswith((b"\xff\xfe", b"\xfe\xff"))
    if b"\x00" in sample and not is_utf16:
        return False
    decoded = _decode_text(sample)
    if not decoded:
        return False
    control = sum(1 for ch in decoded if ord(ch) < 32 and ch not in "\t\r\n\f")
    return control / len(decoded) <= _MAX_CONTROL_CHAR_RATIO


def _docx_zip(data: bytes, settings: Settings) -> zipfile.ZipFile | None:
    """The opened archive if ``data`` is a DOCX, else ``None``. Guards against zip bombs."""
    if not data.startswith(b"PK\x03\x04"):
        return None
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return None
    names = set(archive.namelist())
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        return None
    if sum(item.file_size for item in archive.infolist()) > settings.max_docx_uncompressed_bytes:
        raise _unreadable("This Word document is too large to process.")
    return archive


def _docx_page_count(archive: zipfile.ZipFile) -> int | None:
    """Pages as last recorded by the editor in docProps/app.xml (absent in many files)."""
    try:
        info = archive.getinfo("docProps/app.xml")
    except KeyError:
        return None
    if info.file_size > _APP_XML_MAX_BYTES:
        return None
    match = _PAGES_RE.search(archive.read(info))
    return int(match.group(1)) if match else None


def _pdf_page_count(data: bytes) -> int:
    import pymupdf

    with _PYMUPDF_LOCK:
        try:
            doc = pymupdf.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise _unreadable("This PDF could not be opened. It may be corrupted.") from exc
        try:
            if doc.needs_pass:
                raise AppError(
                    422,
                    "PDF_PASSWORD_PROTECTED",
                    "This PDF is password protected. Remove the password and upload it again.",
                )
            return int(doc.page_count)
        finally:
            doc.close()


def inspect_file(data: bytes, settings: Settings) -> FileInfo:
    """Detect the type from the bytes and enforce the page limit.

    Raises ``AppError``: 422 ``EMPTY_FILE`` / ``UNREADABLE_DOCUMENT`` /
    ``PDF_PASSWORD_PROTECTED`` / ``PAGE_LIMIT_EXCEEDED``, 415 ``UNSUPPORTED_TYPE``.
    """
    if not data:
        raise AppError(422, "EMPTY_FILE", "The file is empty.")

    kind: Kind
    pages: int | None
    if _is_pdf(data):
        kind, pages = "pdf", _pdf_page_count(data)
    elif (archive := _docx_zip(data, settings)) is not None:
        with archive:
            kind, pages = "docx", _docx_page_count(archive)
    elif _looks_like_text(data):
        kind, pages = "txt", None
    else:
        raise AppError(
            415,
            "UNSUPPORTED_TYPE",
            "Unsupported file type. Upload a PDF, DOCX or TXT file.",
            {"allowed": ["pdf", "docx", "txt"]},
        )

    if pages is not None and pages > settings.max_resume_pages:
        raise AppError(
            422,
            "PAGE_LIMIT_EXCEEDED",
            f"This document has {pages} pages; the limit is {settings.max_resume_pages}.",
            {"pages": pages, "max_pages": settings.max_resume_pages},
        )
    return FileInfo(kind=kind, mime_type=MIME_TYPES[kind], num_pages=pages)


# ── Text extraction ─────────────────────────────────────────────────────────


def normalise_text(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def text_stats(text: str) -> tuple[int, int]:
    """``(characters, words)``; characters exclude newlines (as the n8n workflow counted)."""
    return len(text.replace("\n", "")), len(text.split())


def _pdf_text(data: bytes) -> str:
    import pymupdf

    with _PYMUPDF_LOCK:
        doc = pymupdf.open(stream=data, filetype="pdf")
        try:
            return "\n".join(page.get_text() for page in doc)
        finally:
            doc.close()


def _docx_text(data: bytes) -> str:
    from docx import Document
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise _unreadable("This Word document could not be opened. It may be corrupted.") from exc

    lines: list[str] = []
    # Contact details often sit in the page header; include each distinct header once.
    seen_headers: set[str] = set()
    for section in doc.sections:
        header_text = "\n".join(p.text for p in section.header.paragraphs if p.text.strip())
        if header_text and header_text not in seen_headers:
            seen_headers.add(header_text)
            lines.append(header_text)

    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            lines.append(Paragraph(child, doc).text)
        elif child.tag == qn("w:tbl"):
            for row in Table(child, doc).rows:
                cells: list[str] = []
                last_tc: Any = None
                for cell in row.cells:
                    if cell._tc is last_tc:  # merged cells repeat the same element
                        continue
                    last_tc = cell._tc
                    if cell.text.strip():
                        cells.append(cell.text.strip())
                if cells:
                    lines.append(" | ".join(cells))
    return "\n".join(lines)


def _extract_sync(data: bytes, info: FileInfo, settings: Settings) -> ExtractedText:
    if info.kind == "pdf":
        text = normalise_text(_pdf_text(data))
        # A text layer this short means a scan (or an image-only export): OCR it instead.
        if len(text) < settings.scanned_pdf_min_chars:
            return ExtractedText(text="", is_scanned=True)
        return ExtractedText(text=text)
    if info.kind == "docx":
        return ExtractedText(text=normalise_text(_docx_text(data)))
    return ExtractedText(text=normalise_text(_decode_text(data)))


async def extract_text(data: bytes, info: FileInfo, settings: Settings) -> ExtractedText:
    return await asyncio.to_thread(_extract_sync, data, info, settings)


# ── Vision OCR for scanned PDFs ─────────────────────────────────────────────


def _render_pages_sync(data: bytes, dpi: int) -> list[bytes]:
    import pymupdf

    with _PYMUPDF_LOCK:
        doc = pymupdf.open(stream=data, filetype="pdf")
        try:
            return [page.get_pixmap(dpi=dpi).tobytes("png") for page in doc]
        finally:
            doc.close()


async def render_pdf_pages(data: bytes, settings: Settings) -> list[bytes]:
    """Each page as a PNG. The page limit (checked earlier) bounds this to a few images."""
    return await asyncio.to_thread(_render_pages_sync, data, settings.ocr_render_dpi)


async def transcribe_scanned_pdf(data: bytes, llm: Any, settings: Settings) -> str:
    """Vision-OCR a scanned PDF: all pages go to the model in one transcribe-only request."""
    pages = await render_pdf_pages(data, settings)
    if not pages:
        raise _unreadable("This PDF has no pages.")
    prompt = f"Transcribe the {len(pages)} page image(s) that follow."
    raw = await llm.text(
        "ocr",
        instructions=prompts.OCR_TRANSCRIBE_PROMPT,
        input=image_input(prompt, pages),
    )
    return normalise_text(raw)
