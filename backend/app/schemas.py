"""Request/response models and structured-output models for the LLM.

API field names are the public contract the frontend (phase 4) codes against. Database
columns keep their n8n-era names (``file_id``, ``url_id``, ``is_candidate``); the mapping
happens in the ``*_out`` converters in ``app.services.documents``.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Mode = Literal["candidate", "recruiter"]

# The shortest pasted JD worth processing (n8n: more than 10 characters once whitespace
# is collapsed).
MIN_JD_TEXT_CHARS = 10
MAX_JD_URL_CHARS = 2048


# ── Documents ───────────────────────────────────────────────────────────────


class ResumeOut(BaseModel):
    """Resume metadata. Never includes the file bytes or (for lists) the extracted text."""

    id: uuid.UUID
    file_name: str | None
    file_size: int | None
    mime_type: str | None
    num_pages: int | None
    num_characters: int | None
    num_words: int | None
    is_scanned: bool
    mode: Mode
    created_at: datetime | None


class JobDescriptionOut(BaseModel):
    id: uuid.UUID
    jd_url: str | None
    mode: Mode
    validation_note: str | None
    jd_object: dict[str, Any] | None
    created_at: datetime | None


class JobDescriptionCreate(BaseModel):
    """Exactly one of ``url`` or ``text``. Length against ``MAX_JD_CHARS`` is checked in the
    router (the limit is a setting, not a constant)."""

    model_config = ConfigDict(extra="forbid")

    url: str | None = None
    text: str | None = None
    mode: Mode

    @field_validator("url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > MAX_JD_URL_CHARS:
            raise ValueError(f"url must be at most {MAX_JD_URL_CHARS} characters")
        if not re.match(r"^https?://[^\s/]+", value, re.IGNORECASE):
            raise ValueError("url must start with http:// or https:// and include a host")
        return value

    @model_validator(mode="after")
    def _exactly_one_source(self) -> JobDescriptionCreate:
        has_url = bool(self.url)
        has_text = self.text is not None and bool(self.text.strip())
        if has_url == has_text:
            raise ValueError("provide exactly one of 'url' or 'text'")
        if has_text:
            collapsed = re.sub(r"\s+", " ", self.text or "").strip()
            if len(collapsed) <= MIN_JD_TEXT_CHARS:
                raise ValueError(f"text must be longer than {MIN_JD_TEXT_CHARS} characters")
        return self


class JobAccepted(BaseModel):
    """202 body for anything that runs as a background job."""

    job_id: uuid.UUID
    status: Literal["queued", "running"] = "queued"


# ── Jobs ────────────────────────────────────────────────────────────────────


class JobStep(BaseModel):
    name: str
    label: str | None = None
    status: Literal["running", "done", "failed"]
    started_at: datetime | None = None
    finished_at: datetime | None = None


class JobOut(BaseModel):
    id: uuid.UUID
    kind: str
    status: Literal["queued", "running", "succeeded", "failed"]
    steps: list[JobStep]
    result: dict[str, Any] | None
    error: dict[str, Any] | None  # {"code", "message", "details"}
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None


# ── LLM structured outputs ──────────────────────────────────────────────────


class JdExtraction(BaseModel):
    """Fields pulled from a (validated) job posting. Same keys the n8n extractor produced."""

    job_title: str | None
    company_name: str | None
    location: str | None
    employment_type: str | None
    description: str | None
    responsibilities: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    benefits: list[str] = Field(default_factory=list)
