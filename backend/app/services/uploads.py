"""Streamed, size-capped multipart upload reading.

FastAPI's ``UploadFile`` parameters make Starlette parse (and spool to disk) the *whole*
request body before the endpoint runs, so a 100 MB upload would be written out before we
could refuse it. Instead the endpoint takes the raw ``Request`` and this module feeds
Starlette's multipart parser through a counting wrapper that raises ``413 FILE_TOO_LARGE``
the moment the body passes ``MAX_UPLOAD_BYTES`` (+ ``UPLOAD_OVERHEAD_BYTES`` of multipart
framing). Nothing beyond the cap is ever read, and a ``Content-Length`` over the cap is
refused before the first byte is read.
"""

from __future__ import annotations

import os
import re
import unicodedata
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field

from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.requests import Request

from app.config import Settings
from app.errors import AppError

_MAX_FILENAME_CHARS = 255


@dataclass
class Upload:
    filename: str
    data: bytes
    fields: dict[str, str] = field(default_factory=dict)


def _too_large(settings: Settings) -> AppError:
    mb = settings.max_upload_bytes / (1024 * 1024)
    return AppError(
        413,
        "FILE_TOO_LARGE",
        f"The file is larger than the {mb:g} MB limit.",
        {"max_bytes": settings.max_upload_bytes},
    )


def sanitize_filename(name: str | None) -> str:
    """A display-safe file name: no path, no control characters, bounded length."""
    base = os.path.basename((name or "").replace("\\", "/"))
    base = "".join(ch for ch in unicodedata.normalize("NFC", base) if ch.isprintable())
    base = re.sub(r"\s+", " ", base).strip().strip(".")
    return (base or "resume")[:_MAX_FILENAME_CHARS]


async def read_upload(request: Request, settings: Settings, file_field: str = "file") -> Upload:
    """Read one file part (plus simple text fields) from a multipart request.

    Raises ``413 FILE_TOO_LARGE`` as soon as the cap is exceeded, ``400 BAD_REQUEST`` for a
    non-multipart or malformed body and ``422 VALIDATION_ERROR`` when the file is missing.
    """
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        raise AppError(400, "BAD_REQUEST", "Send the file as multipart/form-data.")

    cap = settings.max_upload_bytes + settings.upload_overhead_bytes
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > cap:
                raise _too_large(settings)
        except ValueError:
            raise AppError(400, "BAD_REQUEST", "Invalid Content-Length header.") from None

    async def limited() -> AsyncGenerator[bytes, None]:
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > cap:
                raise _too_large(settings)
            yield chunk

    parser = MultiPartParser(
        request.headers,
        limited(),
        max_files=1,
        max_fields=10,
        max_part_size=settings.max_upload_bytes + settings.upload_overhead_bytes,
    )
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        raise AppError(400, "BAD_REQUEST", f"Malformed upload: {exc.message}") from exc

    try:
        part = form.get(file_field)
        if not isinstance(part, UploadFile):
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Request validation failed.",
                [{"loc": ["body", file_field], "message": "Field required", "type": "missing"}],
            )
        data = await part.read()
        if len(data) > settings.max_upload_bytes:
            raise _too_large(settings)
        text_fields = {key: value for key, value in form.items() if isinstance(value, str)}
        return Upload(filename=sanitize_filename(part.filename), data=data, fields=text_fields)
    finally:
        await form.close()
