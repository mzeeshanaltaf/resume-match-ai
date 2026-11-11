from __future__ import annotations

import io
import zipfile
from collections.abc import Callable

import pytest

from app.config import Settings
from app.errors import AppError
from app.services import extraction
from tests.fakes import RESUME_TEXT, FakeLLM, make_docx, make_password_pdf, make_pdf, make_scanned_pdf


def _inspect(data: bytes, settings: Settings) -> extraction.FileInfo:
    return extraction.inspect_file(data, settings)


def test_pdf_detected_with_page_count(settings: Settings) -> None:
    info = _inspect(make_pdf(pages=3), settings)
    assert (info.kind, info.mime_type, info.num_pages) == ("pdf", "application/pdf", 3)


def test_type_comes_from_magic_bytes_not_the_name(settings: Settings) -> None:
    # inspect_file never sees a file name or MIME type: bytes alone decide.
    assert _inspect(make_docx(), settings).kind == "docx"
    assert _inspect(RESUME_TEXT.encode(), settings).kind == "txt"


def test_page_limit_boundary(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(max_resume_pages=5)
    assert _inspect(make_pdf(pages=5), settings).num_pages == 5
    with pytest.raises(AppError) as exc:
        _inspect(make_pdf(pages=6), settings)
    assert (exc.value.status_code, exc.value.code) == (422, "PAGE_LIMIT_EXCEEDED")
    assert exc.value.details == {"pages": 6, "max_pages": 5}


def test_docx_page_count_read_from_app_xml(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(max_resume_pages=5)
    assert _inspect(make_docx(pages_property=2), settings).num_pages == 2
    with pytest.raises(AppError) as exc:
        _inspect(make_docx(pages_property=9), settings)
    assert exc.value.code == "PAGE_LIMIT_EXCEEDED"


def test_docx_without_page_property_has_unknown_pages(settings: Settings) -> None:
    assert _inspect(make_docx(drop_app_xml=True), settings).num_pages is None


@pytest.mark.parametrize(
    "payload",
    [
        b"\x00\x01\x02\x03binary\x00\x00garbage" * 50,  # NUL bytes
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 100,  # an image
        b"MZ\x90\x00" + b"\x00" * 100,  # an executable
    ],
)
def test_binary_files_are_unsupported(payload: bytes, settings: Settings) -> None:
    with pytest.raises(AppError) as exc:
        _inspect(payload, settings)
    assert (exc.value.status_code, exc.value.code) == (415, "UNSUPPORTED_TYPE")


def test_other_zip_is_unsupported(settings: Settings) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("hello.txt", "hi")
    with pytest.raises(AppError) as exc:
        _inspect(buffer.getvalue(), settings)
    assert exc.value.code == "UNSUPPORTED_TYPE"


def test_empty_file(settings: Settings) -> None:
    with pytest.raises(AppError) as exc:
        _inspect(b"", settings)
    assert (exc.value.status_code, exc.value.code) == (422, "EMPTY_FILE")


def test_corrupt_pdf_is_unreadable(settings: Settings) -> None:
    with pytest.raises(AppError) as exc:
        _inspect(b"%PDF-1.7\nthis is not really a pdf", settings)
    assert exc.value.code == "UNREADABLE_DOCUMENT"


def test_password_protected_pdf(settings: Settings) -> None:
    with pytest.raises(AppError) as exc:
        _inspect(make_password_pdf(), settings)
    assert exc.value.code == "PDF_PASSWORD_PROTECTED"


def test_docx_zip_bomb_guard(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(max_docx_uncompressed_bytes=1000)
    with pytest.raises(AppError) as exc:
        _inspect(make_docx(), settings)  # expands past 1000 bytes
    assert exc.value.code == "UNREADABLE_DOCUMENT"


async def test_extract_pdf_text(settings: Settings) -> None:
    data = make_pdf()
    result = await extraction.extract_text(data, _inspect(data, settings), settings)
    assert not result.is_scanned
    assert "Jane Candidate" in result.text and "Python, PostgreSQL, Docker" in result.text


async def test_extract_docx_includes_paragraphs_and_tables(settings: Settings) -> None:
    data = make_docx()
    result = await extraction.extract_text(data, _inspect(data, settings), settings)
    assert "Jane Candidate" in result.text
    assert "Languages | English, German" in result.text


async def test_extract_txt_handles_encodings(settings: Settings) -> None:
    for raw in (
        "Zoë Müller\nIngénieur logiciel".encode(),
        "Zoë Müller\nIngénieur logiciel".encode("utf-8-sig"),
        "Zoë Müller\nIngénieur logiciel".encode("utf-16"),
        "Zoë Müller\nIngénieur logiciel".encode("cp1252"),
    ):
        result = await extraction.extract_text(raw, _inspect(raw, settings), settings)
        assert result.text == "Zoë Müller\nIngénieur logiciel"


async def test_pdf_without_text_layer_is_flagged_scanned(settings: Settings) -> None:
    data = make_scanned_pdf(pages=2)
    result = await extraction.extract_text(data, _inspect(data, settings), settings)
    assert result.is_scanned and result.text == ""


async def test_scanned_threshold_comes_from_settings(make_settings: Callable[..., Settings]) -> None:
    short = make_pdf(text="Hello world")  # 11 chars
    low = make_settings(scanned_pdf_min_chars=5)
    high = make_settings(scanned_pdf_min_chars=50)
    assert not (await extraction.extract_text(short, _inspect(short, low), low)).is_scanned
    assert (await extraction.extract_text(short, _inspect(short, high), high)).is_scanned


async def test_vision_ocr_renders_every_page_and_uses_the_ocr_prompt(settings: Settings) -> None:
    llm = FakeLLM()
    llm.ocr_text = "  Line one\r\n\r\n\r\n\r\nLine two  "
    text = await extraction.transcribe_scanned_pdf(make_scanned_pdf(pages=3), llm, settings)

    assert text == "Line one\n\nLine two"
    (call,) = llm.text_calls
    assert call["task"] == "ocr"
    content = call["input"][0]["content"]
    images = [part for part in content if part["type"] == "input_image"]
    assert len(images) == 3
    assert all(part["image_url"].startswith("data:image/png;base64,") for part in images)
    assert "Transcribe" in call["instructions"]


def test_text_stats() -> None:
    assert extraction.text_stats("a b\nc") == (4, 3)
    assert extraction.normalise_text("a  \r\n\r\n\r\n\r\nb\x00 ") == "a\n\nb"
