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


# ── Matches ─────────────────────────────────────────────────────────────────
# The report models double as the LLM's structured-output schema and as the API response
# shape. Keys are exactly the ones the n8n prompts produced and the frontend already reads
# (``src/types/n8n.ts``), so the stored ``job_match_summary`` JSON is unchanged.


class KeyStrength(BaseModel):
    strength: str
    evidence: str
    jd_alignment: str


class CriticalGap(BaseModel):
    gap: str
    jd_requirement: str
    impact_level: str  # high | medium | low
    remediation_difficulty: str  # easy | moderate | hard


class CandidateMatchSummary(BaseModel):
    overall_score_percent: int
    score_confidence: str  # high | medium | low
    key_strengths: list[KeyStrength]
    critical_gaps: list[CriticalGap]


class RequirementMet(BaseModel):
    jd_requirement: str
    requirement_type: str  # must_have | preferred | nice_to_have
    resume_evidence: str
    match_quality: str  # strong | moderate | weak
    notes: str | None = None


class GapWeakMatch(BaseModel):
    jd_requirement: str
    requirement_type: str  # must_have | preferred | nice_to_have
    current_status: str
    impact_level: str  # high | medium | low
    suggested_action: str


class DetailedAnalysis(BaseModel):
    requirements_met: list[RequirementMet]
    gaps_and_weak_matches: list[GapWeakMatch]


class ImprovementSuggestion(BaseModel):
    suggestion: str
    example_phrasing: str | None = None
    expected_impact: str
    effort_required: str  # low | medium | high


class ImprovementSuggestions(BaseModel):
    high_priority: list[ImprovementSuggestion]
    medium_priority: list[ImprovementSuggestion]
    nice_to_have: list[ImprovementSuggestion]


class KeywordToAdd(BaseModel):
    keyword: str
    context_suggestion: str
    frequency_recommendation: str


class SkillToRephrase(BaseModel):
    current_phrase: str
    suggested_rephrase: str
    reason: str


class SectionRecommendation(BaseModel):
    section: str
    recommendation: str
    rationale: str


class AtsOptimization(BaseModel):
    keywords_to_add: list[KeywordToAdd]
    skills_to_rephrase: list[SkillToRephrase]
    section_recommendations: list[SectionRecommendation]


class CandidateMatchReport(BaseModel):
    """Job Fit (candidate mode): the full report."""

    match_summary: CandidateMatchSummary
    detailed_analysis: DetailedAnalysis
    improvement_suggestions: ImprovementSuggestions
    ats_optimization: AtsOptimization


class RecruiterMatchSummary(BaseModel):
    overall_score_percent: int
    score_confidence: str  # high | medium | low
    rationale: str


class RecruiterMatchReport(BaseModel):
    """Screening (recruiter mode): score, confidence and a short rationale only."""

    match_summary: RecruiterMatchSummary


class MatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_id: uuid.UUID
    jd_id: uuid.UUID


class MatchListItem(BaseModel):
    """One row of the history / overview: enough to render the ledger without the report."""

    id: uuid.UUID
    resume_id: uuid.UUID
    jd_id: uuid.UUID | None
    mode: Mode
    resume_file_name: str | None
    job_title: str | None
    company_name: str | None
    jd_url: str | None
    overall_score_percent: int | None
    score_confidence: str | None
    created_at: datetime | None


class TailoredBullet(BaseModel):
    original: str | None = None  # the resume's own wording, when this rewrites an existing bullet
    rewritten: str
    why: str


class TailoredExperience(BaseModel):
    heading: str  # e.g. "Senior Engineer, Acme Corp"
    bullets: list[TailoredBullet]


class TailoredBulletsContent(BaseModel):
    summary: str
    experience: list[TailoredExperience]
    skills_to_emphasize: list[str]
    notes: str | None = None


class CoverLetterContent(BaseModel):
    salutation: str
    paragraphs: list[str]
    closing: str
    signature: str
    text: str  # the whole letter as plain text (assembled by the server)


class GeneratedDocumentOut(BaseModel):
    id: uuid.UUID
    match_id: uuid.UUID
    kind: Literal["tailored_bullets", "cover_letter"]
    content: TailoredBulletsContent | CoverLetterContent
    created_at: datetime


class MatchOut(MatchListItem):
    """The full report plus any tailored bullets / cover letters generated for it."""

    report: CandidateMatchReport | RecruiterMatchReport
    documents: list[GeneratedDocumentOut]


# ── Screenings ──────────────────────────────────────────────────────────────


class ScreeningCreate(BaseModel):
    """``resume_ids`` length against ``MAX_SCREENING_RESUMES`` is checked in the router (the
    limit is a setting, not a constant)."""

    model_config = ConfigDict(extra="forbid")

    resume_ids: list[uuid.UUID] = Field(min_length=1)
    jd_id: uuid.UUID

    @field_validator("resume_ids")
    @classmethod
    def _unique(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("resume_ids must not contain duplicates")
        return value


class ScreeningRankedItem(BaseModel):
    rank: int
    match_id: uuid.UUID
    resume_id: uuid.UUID
    file_name: str | None
    overall_score_percent: int
    score_confidence: str
    rationale: str


class ScreeningFailedItem(BaseModel):
    resume_id: uuid.UUID
    file_name: str | None
    error: dict[str, Any]  # {"code", "message", "details"}; the credit was refunded


class ScreeningResult(BaseModel):
    """The ``result`` of a succeeded ``screening`` job."""

    jd_id: uuid.UUID
    ranked: list[ScreeningRankedItem]
    failed: list[ScreeningFailedItem]
    refunded_credits: int


# ── Shapes that travel inside other payloads (documented via app.openapi) ───
# A job's ``result`` and ``error`` are free-form JSON columns, so these models are not
# referenced by any route; they are added to the OpenAPI components so the frontend has one
# typed description of what each job kind returns.


class ApiError(BaseModel):
    """Every non-2xx response body, and a failed job's ``error``."""

    code: str
    message: str
    details: Any = None


class ResumeJobResult(BaseModel):
    """``result`` of a succeeded ``resume_upload`` job."""

    resume_id: uuid.UUID
    resume: ResumeOut


class JobDescriptionJobResult(BaseModel):
    """``result`` of a succeeded ``jd_submit`` job."""

    jd_id: uuid.UUID
    job_description: JobDescriptionOut


class MatchJobResult(BaseModel):
    """``result`` of a succeeded ``match`` job."""

    match_id: uuid.UUID
    match: MatchOut


class DocumentJobResult(BaseModel):
    """``result`` of a succeeded ``tailored_bullets`` or ``cover_letter`` job."""

    document_id: uuid.UUID
    document: GeneratedDocumentOut


# ── Credits, overview, account ──────────────────────────────────────────────


class CreditCosts(BaseModel):
    match: int
    cover_letter: int
    screening_per_resume: int


class CreditsOut(BaseModel):
    balance: int
    costs: CreditCosts


class CreditTransactionOut(BaseModel):
    id: uuid.UUID
    transaction_type: str
    credits_delta: int
    reference_id: uuid.UUID | None
    name_snapshot: str | None
    description: str | None
    created_at: datetime | None


class OverviewCounts(BaseModel):
    resumes: int
    job_descriptions: int
    matches: int


class OverviewOut(BaseModel):
    balance: int
    counts: OverviewCounts
    recent_matches: list[MatchListItem]


class EraseRequest(BaseModel):
    """Body of ``DELETE /internal/users/{id}``. The email is required: the salted hash of it
    is what stops delete-and-re-register farming of the signup credits."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=320)

    @field_validator("email")
    @classmethod
    def _looks_like_email(cls, value: str) -> str:
        value = value.strip()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("email must be an email address")
        return value


class EraseResult(BaseModel):
    user_id: str
    deleted: dict[str, int]  # rows removed per table
    objects_deleted: int
    cancelled_jobs: int


# ── LLM structured outputs ──────────────────────────────────────────────────


class TailoredBulletsOutput(BaseModel):
    summary: str
    experience: list[TailoredExperience]
    skills_to_emphasize: list[str]
    notes: str | None = None


class CoverLetterOutput(BaseModel):
    salutation: str
    paragraphs: list[str]
    closing: str
    signature: str


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
