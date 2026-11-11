"""Live probe of the validation gate (real Decisions API, vision OCR and Firecrawl).

    cd backend
    OPENAI_API_KEY=... FIRECRAWL_API_KEY=... uv run python dev/live_gate_probe.py <corpus_dir> [url ...]

Reads the corpus written by ``dev/live_corpus.py``. For every document it prints the raw
predicate probability, the detected type and its confidence, the latency, and what the
current ``DECISION_MIN_PROBABILITY`` would do. Nothing is stored. Keys come from the
process environment (the backend never reads the repo-root .env.local).
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.errors import AppError  # noqa: E402
from app.services import extraction, prompts, validation  # noqa: E402
from app.services.llm import LLMService  # noqa: E402
from app.services.scraping import FirecrawlClient  # noqa: E402

RESUME_CASES = [
    ("resume_maya.pdf", True),
    ("resume_maya.docx", True),
    ("resume_maya.txt", True),
    ("resume_daniel.pdf", True),
    ("resume_maya_scanned.pdf", True),
    ("cover_letter.pdf", False),
    ("article.pdf", False),
    ("company_about.pdf", False),
    ("jd_as_resume.pdf", False),
    ("blank.pdf", False),
]
JD_TEXT_CASES = [("jd_orbital.txt", True), ("jd_junior.txt", True)]


def summarise(answers: list, min_probability: float, predicate_name: str) -> str:
    result = validation.interpret(list(answers), min_probability, predicate_name)
    choice = next((a for a in answers if getattr(a, "type", None) == "choice"), None)
    confidence = getattr(choice, "confidence", None)
    prob = "refusal" if result.probability is None else f"{result.probability:.3f}"
    conf = "-" if confidence is None else f"{confidence:.3f}"
    verdict = "ACCEPT" if result.accepted else "reject"
    return f"p={prob:<8} type={str(result.detected_type):<16} conf={conf:<6} -> {verdict}"


async def gate(llm: LLMService, kind: str, text: str, min_probability: float) -> tuple[str, float]:
    questions = prompts.resume_gate_questions() if kind == "resume" else prompts.jd_gate_questions()
    name = "is_resume" if kind == "resume" else "is_job_description"
    started = time.perf_counter()
    decision = await llm.decide(input=text, questions=questions)
    elapsed = time.perf_counter() - started
    return summarise(decision.answers, min_probability, name), elapsed


async def main(corpus: Path, urls: list[str]) -> None:
    settings = get_settings()
    llm = LLMService(settings)
    firecrawl = FirecrawlClient(settings)
    threshold = settings.decision_min_probability
    print(f"model={settings.decision_model} threshold={threshold} llm={settings.llm_model} "
          f"tier={settings.llm_service_tier} effort={settings.llm_reasoning_effort}\n")

    print("== Resume gate ==")
    for name, expect in RESUME_CASES:
        data = (corpus / name).read_bytes()
        try:
            info = extraction.inspect_file(data, settings)
            extracted = await extraction.extract_text(data, info, settings)
            text, note = extracted.text, ""
            if extracted.is_scanned:
                started = time.perf_counter()
                text = await extraction.transcribe_scanned_pdf(data, llm, settings)
                note = f" [OCR {time.perf_counter() - started:.1f}s, {len(text)} chars]"
            if not text.strip():
                print(f"{name:<26} (no text{note}) -> rejected before the gate")
                continue
            line, elapsed = await gate(llm, "resume", text, threshold)
            print(f"{name:<26} expect={'accept' if expect else 'reject':<6} {line}  {elapsed:.1f}s{note}")
        except AppError as exc:
            print(f"{name:<26} AppError {exc.code}: {exc.message}")

    print("\n== JD gate (pasted text) ==")
    for name, expect in JD_TEXT_CASES:
        text = (corpus / name).read_text(encoding="utf-8")
        line, elapsed = await gate(llm, "jd", text, threshold)
        print(f"{name:<26} expect={'accept' if expect else 'reject':<6} {line}  {elapsed:.1f}s")
    text = (corpus / "resume_maya.txt").read_text(encoding="utf-8")
    line, elapsed = await gate(llm, "jd", text, threshold)
    print(f"{'resume as JD':<26} expect=reject {line}  {elapsed:.1f}s")
    text = (corpus / "cover_letter.pdf")
    line, elapsed = await gate(llm, "jd", extraction.normalise_text(
        (await extraction.extract_text(text.read_bytes(), extraction.inspect_file(text.read_bytes(), settings), settings)).text
    ), threshold)
    print(f"{'cover letter as JD':<26} expect=reject {line}  {elapsed:.1f}s")

    print("\n== JD gate (URL via Firecrawl) ==")
    for url in urls:
        try:
            started = time.perf_counter()
            page = await firecrawl.scrape(url)
            scrape_s = time.perf_counter() - started
            line, elapsed = await gate(llm, "jd", page.text, threshold)
            print(f"{url}\n    scrape {scrape_s:.1f}s, {len(page.text)} chars (truncated={page.truncated}); {line}  {elapsed:.1f}s")
        except AppError as exc:
            print(f"{url}\n    AppError {exc.code}: {exc.message}")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]), sys.argv[2:]))
