"""The OpenAPI document lists every endpoint of the master plan, and openapi.json is current."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
SNAPSHOT = BACKEND / "openapi.json"

# The master plan's endpoint table (Part 1), expanded to method + path.
PLAN_ENDPOINTS = [
    ("post", "/v1/resumes"),
    ("get", "/v1/resumes"),
    ("get", "/v1/resumes/{resume_id}/file"),
    ("delete", "/v1/resumes/{resume_id}"),
    ("post", "/v1/job-descriptions"),
    ("get", "/v1/job-descriptions"),
    ("get", "/v1/job-descriptions/{jd_id}"),
    ("delete", "/v1/job-descriptions/{jd_id}"),
    ("post", "/v1/matches"),
    ("post", "/v1/screenings"),
    ("get", "/v1/matches"),
    ("get", "/v1/matches/{match_id}"),
    ("delete", "/v1/matches/{match_id}"),
    ("post", "/v1/matches/{match_id}/tailored-bullets"),
    ("post", "/v1/matches/{match_id}/cover-letter"),
    ("get", "/v1/jobs/{job_id}"),
    ("get", "/v1/jobs/{job_id}/events"),
    ("get", "/v1/overview"),
    ("get", "/v1/credits"),
    ("get", "/v1/credits/transactions"),
    ("get", "/v1/account/export"),
    ("delete", "/internal/users/{user_id}"),
    ("get", "/health"),
]


def _current_document() -> dict:
    spec = importlib.util.spec_from_file_location("export_openapi", BACKEND / "dev" / "export_openapi.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_document()


def test_every_endpoint_in_the_master_plan_is_documented() -> None:
    paths = _current_document()["paths"]
    missing = [(m, p) for m, p in PLAN_ENDPOINTS if m not in paths.get(p, {})]
    assert missing == []


def test_every_v1_route_but_health_needs_a_bearer_token_or_the_internal_key() -> None:
    """Guards against shipping an unauthenticated route by accident: each operation under
    /v1 either declares a 401 path through the auth dependency or is a documented exception."""
    document = _current_document()
    unprotected = []
    for path, operations in document["paths"].items():
        for method, operation in operations.items():
            if path == "/health":
                continue
            params = [p["name"].lower() for p in operation.get("parameters", [])]
            if path.startswith("/internal"):
                assert "x-internal-key" in params, (method, path)
            elif "authorization" not in params:
                unprotected.append((method, path))
    assert unprotected == []


def test_job_started_endpoints_answer_202_with_a_job_id() -> None:
    paths = _current_document()["paths"]
    for path in (
        "/v1/resumes",
        "/v1/job-descriptions",
        "/v1/matches",
        "/v1/screenings",
        "/v1/matches/{match_id}/tailored-bullets",
        "/v1/matches/{match_id}/cover-letter",
    ):
        responses = paths[path]["post"]["responses"]
        assert "202" in responses, path


def test_job_result_shapes_are_published_for_the_frontend() -> None:
    schemas = _current_document()["components"]["schemas"]
    for name in (
        "ApiError",
        "ResumeJobResult",
        "JobDescriptionJobResult",
        "MatchJobResult",
        "DocumentJobResult",
        "ScreeningResult",
        "MatchOut",
        "GeneratedDocumentOut",
        "CandidateMatchReport",
        "RecruiterMatchReport",
        "ScreeningRankedItem",
    ):
        assert name in schemas, name
    assert set(schemas["ApiError"]["properties"]) == {"code", "message", "details"}


def test_internal_endpoint_documents_its_request_body() -> None:
    operation = _current_document()["paths"]["/internal/users/{user_id}"]["delete"]
    schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert schema["$ref"].endswith("/EraseRequest")


def test_openapi_json_snapshot_is_current() -> None:
    if not SNAPSHOT.exists():
        pytest.fail("backend/openapi.json is missing: run `uv run python dev/export_openapi.py`")
    assert json.loads(SNAPSHOT.read_text(encoding="utf-8")) == _current_document(), (
        "backend/openapi.json is out of date: run `uv run python dev/export_openapi.py` and commit it"
    )
