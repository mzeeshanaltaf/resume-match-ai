from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.config import Settings, get_settings, normalise_async_database_url


def _fresh(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    # Start from a clean slate: ignore any real env vars that map to a setting.
    for key in list(os.environ):
        if key.lower() in Settings.model_fields:
            monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_defaults_match_master_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch)
    assert s.llm_model == "gpt-6-luna"
    assert s.llm_service_tier == "flex"
    assert s.llm_fallback_service_tier == "default"
    assert s.llm_reasoning_effort == "low"
    assert s.llm_timeout_seconds == 600
    assert s.decision_model == "gpt-6-luna"
    assert s.decision_min_probability == 0.7
    assert s.max_upload_bytes == 5 * 1024 * 1024
    assert s.max_resume_pages == 5
    assert s.max_resume_chars == 20_000
    assert s.max_jd_chars == 20_000
    assert s.max_screening_resumes == 20
    assert s.max_resumes_per_user == 50
    assert s.signup_credits == 10
    assert s.match_credit_cost == 1
    assert s.storage_backend == "local"
    assert s.auth_algorithms == ["EdDSA"]


_PROD_OK = {
    "ENVIRONMENT": "prod",
    "EMAIL_HASH_SALT": "a-long-random-production-salt",
    "INTERNAL_API_KEY": "a-long-random-internal-key",
    "STORAGE_BACKEND": "s3",
    "OPENAI_API_KEY": "sk-test",
}


def test_production_accepts_a_complete_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _fresh(monkeypatch, **_PROD_OK).environment == "prod"


@pytest.mark.parametrize(
    ("override", "mentions"),
    [
        ({"EMAIL_HASH_SALT": "dev-only-change-me"}, "EMAIL_HASH_SALT"),  # the public default
        ({"EMAIL_HASH_SALT": "short"}, "EMAIL_HASH_SALT"),
        ({"INTERNAL_API_KEY": ""}, "INTERNAL_API_KEY"),
        ({"INTERNAL_API_KEY": "dev-internal"}, "INTERNAL_API_KEY"),
        ({"STORAGE_BACKEND": "local"}, "STORAGE_BACKEND"),
        ({"OPENAI_API_KEY": ""}, "OPENAI_API_KEY"),
    ],
)
def test_production_refuses_to_start_on_development_defaults(
    monkeypatch: pytest.MonkeyPatch, override: dict[str, str], mentions: str
) -> None:
    with pytest.raises(ValueError, match=mentions):
        _fresh(monkeypatch, **{**_PROD_OK, **override})


def test_development_and_test_keep_their_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in ("dev", "test"):
        s = _fresh(monkeypatch, ENVIRONMENT=env)
        assert s.email_hash_salt == "dev-only-change-me" and s.storage_backend == "local"


def test_default_database_is_local_dev_never_production(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch)
    assert "127.0.0.1" in s.database_url


def test_env_overrides_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(
        monkeypatch,
        LLM_MODEL="other-model",
        LLM_SERVICE_TIER="default",
        LLM_TIMEOUT_SECONDS="30",
        DECISION_MIN_PROBABILITY="0.9",
        MAX_UPLOAD_BYTES="1024",
        MAX_RESUME_PAGES="2",
        SIGNUP_CREDITS="3",
        STORAGE_BACKEND="s3",
    )
    assert s.llm_model == "other-model"
    assert s.llm_service_tier == "default"
    assert s.llm_timeout_seconds == 30
    assert s.decision_min_probability == 0.9
    assert s.max_upload_bytes == 1024
    assert s.max_resume_pages == 2
    assert s.signup_credits == 3
    assert s.storage_backend == "s3"


def test_empty_fallback_tier_disables_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _fresh(monkeypatch).fallback_service_tier == "default"
    assert _fresh(monkeypatch, LLM_FALLBACK_SERVICE_TIER="").fallback_service_tier is None
    assert _fresh(monkeypatch, LLM_FALLBACK_SERVICE_TIER="  ").fallback_service_tier is None


def test_per_task_reasoning_effort_overrides_global(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch, LLM_REASONING_EFFORT="medium", LLM_MATCH_REASONING_EFFORT="high")
    assert s.reasoning_effort_for("match") == "high"
    assert s.reasoning_effort_for("jd") == "medium"
    assert s.reasoning_effort_for("cover_letter") == "medium"


def test_blank_per_task_override_means_no_override(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch, LLM_OCR_REASONING_EFFORT="")
    assert s.reasoning_effort_for("ocr") == "low"


def test_invalid_reasoning_effort_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValueError):
        _fresh(monkeypatch, LLM_REASONING_EFFORT="extreme")


def test_cors_origins_parse_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch, CORS_ORIGINS="http://127.0.0.1:3000, https://resumatch.zeeshanai.cloud/")
    assert s.cors_origins == ["http://127.0.0.1:3000", "https://resumatch.zeeshanai.cloud"]


def test_audience_defaults_to_issuer(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _fresh(monkeypatch, AUTH_ISSUER="https://a.test")
    assert s.jwt_audience == "https://a.test"
    assert _fresh(monkeypatch, AUTH_ISSUER="https://a.test", AUTH_AUDIENCE="api").jwt_audience == "api"


def test_limits_must_be_positive(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValueError):
        _fresh(monkeypatch, MAX_UPLOAD_BYTES="0")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("postgres://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
        ("postgresql://u:p@h/db", "postgresql+asyncpg://u:p@h/db"),
        ("postgresql+asyncpg://u:p@h/db", "postgresql+asyncpg://u:p@h/db"),
        ("postgres://u:p@h/db?sslmode=require", "postgresql+asyncpg://u:p@h/db?ssl=require"),
        ("postgres://u:p@h/db?sslmode=disable", "postgresql+asyncpg://u:p@h/db"),
    ],
)
def test_database_url_normalisation(raw: str, expected: str) -> None:
    assert normalise_async_database_url(raw) == expected


def test_unsupported_database_scheme() -> None:
    with pytest.raises(ValueError):
        normalise_async_database_url("mysql://u:p@h/db")


def test_env_example_lists_every_setting() -> None:
    example = (Path(__file__).resolve().parent.parent / ".env.example").read_text(encoding="utf-8")
    documented = {
        line.split("=", 1)[0].strip().lower()
        for line in example.splitlines()
        if "=" in line and not line.lstrip().startswith("#")
    }
    missing = set(Settings.model_fields) - documented
    assert not missing, f".env.example is missing: {sorted(missing)}"


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()
    assert get_settings() is get_settings()
    get_settings.cache_clear()
