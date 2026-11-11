from __future__ import annotations

from collections.abc import Callable

import pytest

from app.config import Settings
from app.errors import AppError
from app.services import validation
from tests.fakes import FakeLLM, choice_answer, predicate_answer, refusal_answer


async def test_accepts_at_and_above_the_threshold(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(decision_min_probability=0.7)
    llm = FakeLLM()
    for probability in (0.7, 0.71, 1.0):
        llm.resume_probability = probability
        result = await validation.validate_resume("text", llm, settings)
        assert result.accepted and result.probability == probability


async def test_rejects_below_the_threshold(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(decision_min_probability=0.7)
    llm = FakeLLM()
    llm.resume_probability = 0.69
    with pytest.raises(AppError) as exc:
        await validation.validate_resume("text", llm, settings)
    assert (exc.value.status_code, exc.value.code) == (422, "INVALID_RESUME")
    assert exc.value.details["threshold"] == 0.7 and exc.value.details["probability"] == 0.69


async def test_threshold_is_a_setting(make_settings: Callable[..., Settings]) -> None:
    llm = FakeLLM()
    llm.resume_probability = 0.85
    await validation.validate_resume("t", llm, make_settings(decision_min_probability=0.8))
    with pytest.raises(AppError):
        await validation.validate_resume("t", llm, make_settings(decision_min_probability=0.9))


@pytest.mark.parametrize(
    ("detected", "expected"),
    [
        ("cover_letter", "This looks like a cover letter, not a resume."),
        ("job_description", "This looks like a job description, not a resume."),
        ("article_or_blog", "This looks like an article or blog post, not a resume."),
        ("company_page", "This looks like a company page, not a resume."),
    ],
)
async def test_resume_rejection_names_what_the_document_is(
    detected: str, expected: str, settings: Settings
) -> None:
    llm = FakeLLM()
    llm.resume_probability, llm.resume_type = 0.05, detected
    with pytest.raises(AppError) as exc:
        await validation.validate_resume("text", llm, settings)
    assert exc.value.message == expected
    assert exc.value.details["detected_type"] == detected


async def test_generic_message_when_type_is_other_or_resume(settings: Settings) -> None:
    for detected in ("other", "resume"):
        llm = FakeLLM()
        llm.resume_probability, llm.resume_type = 0.2, detected
        with pytest.raises(AppError) as exc:
            await validation.validate_resume("text", llm, settings)
        assert "doesn't look like a resume" in exc.value.message


async def test_jd_gate_uses_invalid_jd_and_its_own_messages(settings: Settings) -> None:
    llm = FakeLLM()
    llm.jd_probability, llm.jd_type = 0.1, "resume"
    with pytest.raises(AppError) as exc:
        await validation.validate_jd("text", llm, settings)
    assert (exc.value.status_code, exc.value.code) == (422, "INVALID_JD")
    assert exc.value.message == "This looks like a resume, not a job description."

    llm.jd_type = "company_page"
    with pytest.raises(AppError) as exc:
        await validation.validate_jd("text", llm, settings)
    assert "company page" in exc.value.message


@pytest.mark.parametrize("refused", [0, 1])
async def test_a_refusal_is_a_rejection_even_with_a_high_probability(
    refused: int, settings: Settings
) -> None:
    llm = FakeLLM()

    def answers(questions: list[dict]) -> list:
        built = [predicate_answer(0.99, questions[0]["name"]), choice_answer("resume")]
        built[refused] = refusal_answer(questions[refused]["name"])
        return built

    llm.answers_override = answers
    with pytest.raises(AppError) as exc:
        await validation.validate_resume("text", llm, settings)
    assert exc.value.code == "INVALID_RESUME"
    assert "couldn't evaluate" in exc.value.message


async def test_request_shape_two_questions_text_as_input(settings: Settings) -> None:
    llm = FakeLLM()
    await validation.validate_resume("THE RESUME TEXT", llm, settings)
    (call,) = llm.decide_calls
    assert call["input"] == "THE RESUME TEXT"
    predicate, choice = call["questions"]
    assert predicate["type"] == "predicate" and predicate["name"] == "is_resume"
    assert choice["type"] == "choice" and choice["name"] == "document_type"
    values = [c["value"] for c in choice["choices"]]
    assert values == ["resume", "job_description", "cover_letter", "article_or_blog", "company_page", "other"]
    # the document is data: it is never inside the instructions
    assert "THE RESUME TEXT" not in predicate["instructions"]


async def test_answers_are_matched_by_name_when_order_differs(settings: Settings) -> None:
    llm = FakeLLM()
    llm.answers_override = lambda q: [choice_answer("resume"), predicate_answer(0.9, q[0]["name"])]
    assert (await validation.validate_resume("t", llm, settings)).accepted


async def test_upstream_failure_is_not_a_rejection(settings: Settings) -> None:
    llm = FakeLLM()
    llm.error = AppError(502, "LLM_UNAVAILABLE", "down")
    with pytest.raises(AppError) as exc:
        await validation.validate_resume("t", llm, settings)
    assert exc.value.code == "LLM_UNAVAILABLE"
