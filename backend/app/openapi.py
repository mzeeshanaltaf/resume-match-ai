"""OpenAPI additions: the shapes that only ever appear inside a job's ``result`` / ``error``.

FastAPI only documents models a route declares. ``JobOut.result`` is a free-form object (one
column holds every job kind's result), so without this the schema would not describe what a
finished match, screening, document or upload job actually returns. These models are added
to ``components.schemas`` so the frontend can type them.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from app.schemas import (
    ApiError,
    DocumentJobResult,
    JobDescriptionJobResult,
    MatchJobResult,
    ResumeJobResult,
    ScreeningResult,
)

EXTRA_MODELS: tuple[type[BaseModel], ...] = (
    ApiError,
    ResumeJobResult,
    JobDescriptionJobResult,
    MatchJobResult,
    DocumentJobResult,
    ScreeningResult,
)


def install_extra_schemas(app: FastAPI) -> None:
    original = app.openapi

    def openapi() -> dict[str, Any]:
        schema = original()
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        for model in EXTRA_MODELS:
            doc = model.model_json_schema(ref_template="#/components/schemas/{model}", mode="serialization")
            for name, definition in doc.pop("$defs", {}).items():
                components.setdefault(name, definition)
            components[model.__name__] = doc
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
