"""Write the API's OpenAPI document to ``backend/openapi.json``.

    cd backend
    uv run python dev/export_openapi.py

The frontend (phase 4) generates or hand-writes its types from this file, and
``tests/test_openapi.py`` fails when it is out of date, so re-run this after changing any
route, request/response model or documented error response and commit the result.

It builds the app without touching a database or the network (the schema is derived from the
route definitions only).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

OUTPUT = BACKEND / "openapi.json"


def build_document() -> dict:
    # Settings values never appear in the schema; "dev" keeps /docs enabled like a local run.
    app = create_app(Settings(_env_file=None, environment="dev"))
    return app.openapi()


def main() -> None:
    document = build_document()
    OUTPUT.write_text(json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(document['paths'])} paths)")


if __name__ == "__main__":
    main()
