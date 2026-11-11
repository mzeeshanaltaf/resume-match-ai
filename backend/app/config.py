"""Application settings.

Every tunable lives here and is overridable by an environment variable of the same
name (case-insensitive). Call sites read from ``get_settings()``; nothing else in the
codebase hardcodes a model name, limit, timeout or threshold.

Settings are read from the process environment and from ``backend/.env`` (never from
the repo-root ``.env.local``, which holds the production ``DATABASE_URL``).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_SALT = "dev-only-change-me"

# Tasks that can override LLM_REASONING_EFFORT (LLM_<TASK>_REASONING_EFFORT).
ReasoningTask = Literal["match", "jd", "ocr", "bullets", "cover_letter"]
ReasoningEffort = Literal["minimal", "low", "medium", "high"]


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):  # tolerate a JSON list too
            return stripped
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── General ─────────────────────────────────────────────────────────────
    environment: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    # ── Database ────────────────────────────────────────────────────────────
    # Same URL shape the frontend uses (postgres://...); normalised to asyncpg below.
    database_url: str = "postgresql://resumatch:resumatch@127.0.0.1:5433/resumatch_dev"
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=10, ge=0)

    # ── OpenAI (Responses API + Decisions API) ──────────────────────────────
    openai_api_key: str = ""
    llm_model: str = "gpt-6-luna"
    # `default` = standard processing. `flex` is cheaper but queues and refused about half of
    # the calls in Phase 7 testing; set LLM_SERVICE_TIER=flex to opt back in.
    llm_service_tier: str = "default"
    # One retry on this tier when the primary tier times out or has no capacity (skipped when
    # it equals the primary tier). Set to an empty string to disable the fallback.
    llm_fallback_service_tier: str = "default"
    llm_reasoning_effort: ReasoningEffort = "low"
    llm_match_reasoning_effort: ReasoningEffort | None = None
    llm_jd_reasoning_effort: ReasoningEffort | None = None
    llm_ocr_reasoning_effort: ReasoningEffort | None = None
    llm_bullets_reasoning_effort: ReasoningEffort | None = None
    llm_cover_letter_reasoning_effort: ReasoningEffort | None = None
    llm_timeout_seconds: float = Field(default=600, gt=0)  # sized for flex, which can queue

    # Decisions API validation gate.
    decision_model: str = "gpt-6-luna"
    decision_min_probability: float = Field(default=0.7, ge=0, le=1)
    decision_timeout_seconds: float = Field(default=60, gt=0)  # not a queued/flex request

    # ── Firecrawl (job-page scraping) ───────────────────────────────────────
    firecrawl_api_key: str = ""
    firecrawl_base_url: str = "https://api.firecrawl.dev"
    firecrawl_timeout_seconds: float = Field(default=120, gt=0)  # total polling budget
    firecrawl_poll_interval_seconds: float = Field(default=2, gt=0)

    # ── Upload and input limits ─────────────────────────────────────────────
    max_upload_bytes: int = Field(default=5 * 1024 * 1024, gt=0)
    max_resume_pages: int = Field(default=5, gt=0)
    max_resume_chars: int = Field(default=20_000, gt=0)
    max_jd_chars: int = Field(default=20_000, gt=0)
    max_screening_resumes: int = Field(default=20, gt=0)
    max_resumes_per_user: int = Field(default=50, gt=0)
    # A PDF text layer shorter than this is treated as scanned and sent to vision OCR.
    scanned_pdf_min_chars: int = Field(default=20, ge=0)
    # Resolution of the page images sent to vision OCR.
    ocr_render_dpi: int = Field(default=150, ge=72, le=300)
    # Multipart framing (boundaries, the `mode` field) allowed on top of MAX_UPLOAD_BYTES
    # before the raw request body is cut off.
    upload_overhead_bytes: int = Field(default=64 * 1024, ge=0)
    # Zip-bomb guard: a DOCX whose parts expand beyond this is refused before parsing.
    max_docx_uncompressed_bytes: int = Field(default=50 * 1024 * 1024, gt=0)

    # ── Background jobs / SSE ───────────────────────────────────────────────
    # How long a finished job's event history stays in memory for late SSE subscribers
    # (afterwards events are rebuilt from the jobs table).
    job_channel_retention_seconds: int = Field(default=120, ge=0)
    sse_heartbeat_seconds: float = Field(default=15, gt=0)

    # ── Matching / screening ────────────────────────────────────────────────
    # Resumes analysed in parallel inside one screening job (each is one LLM call).
    screening_concurrency: int = Field(default=3, ge=1)
    # Recent matches listed by GET /v1/overview.
    overview_recent_matches: int = Field(default=5, ge=0)

    # ── Credits ─────────────────────────────────────────────────────────────
    signup_credits: int = Field(default=10, ge=0)
    match_credit_cost: int = Field(default=1, gt=0)
    cover_letter_credit_cost: int = Field(default=1, gt=0)
    screening_credit_cost_per_resume: int = Field(default=1, gt=0)
    # Salt for the hash of deleted-account emails. Changing it forgets prior deletions.
    email_hash_salt: str = _DEV_SALT

    # ── Account export ──────────────────────────────────────────────────────
    export_cooldown_seconds: int = Field(default=3600, ge=0)

    # ── Object storage ──────────────────────────────────────────────────────
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: str = ".local_storage"
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_force_path_style: bool = True  # required by MinIO
    storage_sweep_on_startup: bool = True
    # Never sweep objects younger than this (an upload may be mid-flight).
    storage_sweep_min_age_seconds: int = Field(default=3600, ge=0)

    # ── Auth (Better Auth JWT) ──────────────────────────────────────────────
    auth_jwks_url: str = "https://resumatch.zeeshanai.cloud/api/auth/jwks"
    auth_issuer: str = "https://resumatch.zeeshanai.cloud"
    # Better Auth defaults the audience to the issuer; empty means "same as issuer".
    auth_audience: str = ""
    auth_algorithms: Annotated[list[str], NoDecode] = ["EdDSA"]
    auth_jwks_cache_seconds: int = Field(default=3600, gt=0)
    # Minimum gap between JWKS refetches triggered by an unknown key id.
    auth_jwks_min_refresh_seconds: int = Field(default=30, ge=0)
    auth_leeway_seconds: int = Field(default=10, ge=0)

    # ── HTTP ────────────────────────────────────────────────────────────────
    cors_origins: Annotated[list[str], NoDecode] = ["https://resumatch.zeeshanai.cloud"]
    # Shared secret for service-to-service calls (Better Auth -> /internal/*).
    # Empty disables the internal API entirely.
    internal_api_key: str = ""

    # ── Validators ──────────────────────────────────────────────────────────
    @field_validator("cors_origins", "auth_algorithms", mode="before")
    @classmethod
    def _csv_lists(cls, value: object) -> object:
        return _split_csv(value)

    @field_validator("llm_fallback_service_tier", "auth_audience", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator(
        "llm_match_reasoning_effort",
        "llm_jd_reasoning_effort",
        "llm_ocr_reasoning_effort",
        "llm_bullets_reasoning_effort",
        "llm_cover_letter_reasoning_effort",
        mode="before",
    )
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        # `LLM_MATCH_REASONING_EFFORT=` (empty) in an env file means "no override".
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("cors_origins")
    @classmethod
    def _normalise_origins(cls, value: list[str]) -> list[str]:
        return [origin.rstrip("/") for origin in value]

    @model_validator(mode="after")
    def _production_must_be_configured(self) -> Settings:
        """Fail at startup, not at the first deletion, when a production deploy still runs on
        development defaults. (``ENVIRONMENT=prod`` itself is what hides ``/docs``.)"""
        if self.environment != "prod":
            return self
        problems: list[str] = []
        if self.email_hash_salt == _DEV_SALT or len(self.email_hash_salt) < 16:
            problems.append("EMAIL_HASH_SALT must be a secret of at least 16 characters")
        if len(self.internal_api_key) < 16:
            problems.append("INTERNAL_API_KEY must be set (at least 16 characters)")
        if self.storage_backend != "s3":
            problems.append("STORAGE_BACKEND must be 's3' (local files are lost when the container is replaced)")
        if not self.openai_api_key:
            problems.append("OPENAI_API_KEY must be set")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    # ── Derived values ──────────────────────────────────────────────────────
    @property
    def async_database_url(self) -> str:
        """``DATABASE_URL`` rewritten for SQLAlchemy + asyncpg."""
        return normalise_async_database_url(self.database_url)

    @property
    def jwt_audience(self) -> str:
        return self.auth_audience or self.auth_issuer

    @property
    def fallback_service_tier(self) -> str | None:
        return self.llm_fallback_service_tier or None

    def reasoning_effort_for(self, task: ReasoningTask) -> ReasoningEffort:
        """Per-task override if set, else the global ``LLM_REASONING_EFFORT``."""
        override: ReasoningEffort | None = getattr(self, f"llm_{task}_reasoning_effort")
        return override or self.llm_reasoning_effort


def normalise_async_database_url(url: str) -> str:
    """Convert ``postgres://`` / ``postgresql://`` to ``postgresql+asyncpg://``.

    libpq's ``sslmode`` is not accepted by SQLAlchemy's asyncpg dialect, so it is
    mapped to asyncpg's ``ssl`` parameter. Other libpq-only parameters are dropped.
    """
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    elif not scheme.startswith("postgresql+"):
        raise ValueError(f"Unsupported DATABASE_URL scheme: {parts.scheme!r}")

    query: list[tuple[str, str]] = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            if value in ("disable", "allow", "prefer"):
                continue
            query.append(("ssl", "require" if value == "require" else value))
        elif key in ("options", "channel_binding", "application_name"):
            continue  # search_path is set explicitly in app.db
        else:
            query.append((key, value))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


@lru_cache
def get_settings() -> Settings:
    return Settings()
