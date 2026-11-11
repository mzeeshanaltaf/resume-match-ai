"""Local dev server: the real app, a throwaway signing key, optional fake AI.

    cd backend
    uv run python dev/dev_server.py            # fake OpenAI + Firecrawl (no keys needed)
    DEV_REAL_AI=1 uv run python dev/dev_server.py   # real OpenAI/Firecrawl from backend/.env

It serves the real FastAPI app over real HTTP (so multipart streaming and SSE behave as in
production) with ``get_key_store`` replaced by a generated Ed25519 key, and prints a dev JWT
for ``DEV_USER`` (default ``dev-user``). Never point it at a production database.

Fake mode keeps all the real code paths (type detection, page limits, PyMuPDF/python-docx
extraction, rendering for OCR, the gate's threshold logic, storage, jobs, SSE) and replaces
only the network calls to OpenAI and Firecrawl. ``DEV_FAKE_DELAY`` (seconds, default 0.6)
slows each fake call so progress events are visible one by one.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from typing import Any

import jwt
import uvicorn
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

ISSUER = "http://dev.local"
KID = "dev-key"
USER = os.environ.get("DEV_USER", "dev-user")
PORT = int(os.environ.get("PORT", "8000"))

os.environ.setdefault("AUTH_ISSUER", ISSUER)
os.environ.setdefault("CORS_ORIGINS", "http://127.0.0.1:3000")

from app.auth import StaticKeyStore, get_key_store  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.llm import get_llm  # noqa: E402
from app.services.scraping import get_firecrawl  # noqa: E402
from tests.fakes import FakeFirecrawl, FakeLLM  # noqa: E402


class SlowFakeLLM(FakeLLM):
    def __init__(self, delay: float) -> None:
        super().__init__()
        self._delay = delay

    async def decide(self, **kw: Any) -> Any:
        await asyncio.sleep(self._delay)
        return await super().decide(**kw)

    async def text(self, *a: Any, **kw: Any) -> str:
        await asyncio.sleep(self._delay)
        return await super().text(*a, **kw)

    async def parse(self, *a: Any, **kw: Any) -> Any:
        await asyncio.sleep(self._delay)
        return await super().parse(*a, **kw)


class SlowFakeFirecrawl(FakeFirecrawl):
    def __init__(self, delay: float) -> None:
        super().__init__()
        self._delay = delay

    async def scrape(self, url: str) -> Any:
        await asyncio.sleep(self._delay)
        return await super().scrape(url)


def build() -> Any:
    key = Ed25519PrivateKey.generate()
    app = create_app()
    app.dependency_overrides[get_key_store] = lambda: StaticKeyStore({KID: key.public_key()})
    if not os.environ.get("DEV_REAL_AI"):
        delay = float(os.environ.get("DEV_FAKE_DELAY", "0.6"))
        llm, firecrawl = SlowFakeLLM(delay), SlowFakeFirecrawl(delay)
        app.dependency_overrides[get_llm] = lambda: llm
        app.dependency_overrides[get_firecrawl] = lambda: firecrawl
        print("AI: FAKE (set DEV_REAL_AI=1 to use OpenAI/Firecrawl from backend/.env)")
    else:
        print("AI: REAL")

    now = int(time.time())
    token = jwt.encode(
        {"sub": USER, "email": f"{USER}@example.test", "iss": ISSUER, "aud": ISSUER, "iat": now, "exp": now + 8 * 3600},
        key,
        algorithm="EdDSA",
        headers={"kid": KID},
    )
    print(f"Dev JWT for {USER!r} (valid 8h):\n{token}\n", flush=True)
    return app


if __name__ == "__main__":
    uvicorn.run(build(), host="127.0.0.1", port=PORT, log_level="info")
