"""The OpenAI wrapper against a fake SDK client: settings drive model/tier/effort/timeout."""

from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace as NS
from typing import Any

import httpx
import openai
import pytest

from app.config import Settings
from app.errors import AppError
from app.schemas import JdExtraction
from app.services.llm import LLMError, LLMService


def _status_error(cls: type[openai.APIStatusError], status: int) -> openai.APIStatusError:
    request = httpx.Request("POST", "https://api.openai.test/v1/responses")
    response = httpx.Response(status, request=request)
    return cls("boom", response=response, body=None)


class FakeResponses:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = outcomes
        self.calls: list[dict[str, Any]] = []

    async def _next(self, kwargs: dict[str, Any]) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    async def parse(self, **kwargs: Any) -> Any:
        return await self._next(kwargs)

    async def create(self, **kwargs: Any) -> Any:
        return await self._next(kwargs)


class FakeDecisions:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return NS(answers=[])


class FakeClient:
    def __init__(self, outcomes: list[Any] | None = None) -> None:
        self.responses = FakeResponses(outcomes or [])
        self.decisions = FakeDecisions()
        self.options: dict[str, Any] = {}

    def with_options(self, **options: Any) -> FakeClient:
        self.options = options
        return self


def _service(settings: Settings, outcomes: list[Any]) -> tuple[LLMService, FakeClient]:
    client = FakeClient(outcomes)
    return LLMService(settings, client=client), client  # type: ignore[arg-type]


PARSED = NS(output_parsed=JdExtraction(
    job_title="t", company_name=None, location=None, employment_type=None, description=None
))


async def _parse(service: LLMService) -> JdExtraction:
    return await service.parse("jd", instructions="i", input="x", schema=JdExtraction)


async def test_model_tier_effort_and_timeout_come_from_settings(
    make_settings: Callable[..., Settings],
) -> None:
    settings = make_settings(
        llm_model="model-x",
        llm_service_tier="priority",
        llm_reasoning_effort="medium",
        llm_jd_reasoning_effort="high",
        llm_timeout_seconds=42,
    )
    service, client = _service(settings, [PARSED])
    await _parse(service)
    (call,) = client.responses.calls
    assert call["model"] == "model-x"
    assert call["service_tier"] == "priority"
    assert call["reasoning"] == {"effort": "high"}  # per-task override wins
    assert call["timeout"] == 42
    assert call["text_format"] is JdExtraction


async def test_defaults_are_luna_on_the_default_tier_with_low_effort(settings: Settings) -> None:
    service, client = _service(settings, [PARSED, NS(output_text=" hi ")])
    await _parse(service)
    assert await service.text("ocr", input="x") == "hi"
    first, second = client.responses.calls
    assert (first["model"], first["service_tier"]) == ("gpt-6-luna", "default")
    assert first["reasoning"] == {"effort": "low"} and second["reasoning"] == {"effort": "low"}


async def test_global_effort_applies_when_no_task_override(make_settings: Callable[..., Settings]) -> None:
    service, client = _service(make_settings(llm_reasoning_effort="high"), [NS(output_text="x")])
    await service.text("ocr", input="x")
    assert client.responses.calls[0]["reasoning"] == {"effort": "high"}


@pytest.mark.parametrize(
    "failure",
    [
        openai.APITimeoutError(request=httpx.Request("POST", "https://x")),
        _status_error(openai.RateLimitError, 429),  # flex "resource unavailable"
        _status_error(openai.InternalServerError, 503),
    ],
)
async def test_flex_failure_retries_once_on_the_fallback_tier(
    failure: Exception, make_settings: Callable[..., Settings]
) -> None:
    # Flex is opt-in now (LLM_SERVICE_TIER=flex); the fallback only matters when it is chosen.
    service, client = _service(make_settings(llm_service_tier="flex"), [failure, PARSED])
    result = await _parse(service)
    assert result.job_title == "t"
    tiers = [c["service_tier"] for c in client.responses.calls]
    assert tiers == ["flex", "default"]


async def test_failure_on_the_default_tier_is_not_retried_on_the_same_tier(settings: Settings) -> None:
    service, client = _service(settings, [_status_error(openai.RateLimitError, 429), PARSED])
    with pytest.raises(LLMError) as exc:
        await _parse(service)
    assert exc.value.code == "LLM_UNAVAILABLE"
    assert [c["service_tier"] for c in client.responses.calls] == ["default"]


async def test_fallback_tier_is_configurable(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(llm_service_tier="flex", llm_fallback_service_tier="auto")
    service, client = _service(settings, [_status_error(openai.RateLimitError, 429), PARSED])
    await _parse(service)
    assert [c["service_tier"] for c in client.responses.calls] == ["flex", "auto"]


async def test_empty_fallback_disables_the_retry(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(llm_service_tier="flex", llm_fallback_service_tier="")
    service, client = _service(settings, [_status_error(openai.RateLimitError, 429), PARSED])
    with pytest.raises(LLMError) as exc:
        await _parse(service)
    assert exc.value.code == "LLM_UNAVAILABLE"
    assert len(client.responses.calls) == 1


async def test_only_one_retry(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(llm_service_tier="flex")
    timeout = openai.APITimeoutError(request=httpx.Request("POST", "https://x"))
    service, client = _service(settings, [timeout, timeout, PARSED])
    with pytest.raises(LLMError) as exc:
        await _parse(service)
    assert (exc.value.status_code, exc.value.code) == (504, "LLM_TIMEOUT")
    assert len(client.responses.calls) == 2


async def test_non_transient_errors_do_not_retry_or_leak(settings: Settings) -> None:
    service, client = _service(settings, [_status_error(openai.BadRequestError, 400), PARSED])
    with pytest.raises(LLMError) as exc:
        await _parse(service)
    assert exc.value.code == "LLM_ERROR" and "boom" not in exc.value.message
    assert len(client.responses.calls) == 1


async def test_refusal_or_missing_parse_is_a_bad_output(settings: Settings) -> None:
    service, _ = _service(settings, [NS(output_parsed=None)])
    with pytest.raises(LLMError) as exc:
        await _parse(service)
    assert exc.value.code == "LLM_BAD_OUTPUT"


async def test_decisions_use_decision_settings_and_no_service_tier(
    make_settings: Callable[..., Settings],
) -> None:
    settings = make_settings(decision_model="luna-decider", decision_timeout_seconds=7)
    service, client = _service(settings, [])
    await service.decide(input="doc", questions=[{"type": "predicate", "instructions": "q"}])
    (call,) = client.decisions.calls
    assert call["model"] == "luna-decider" and call["timeout"] == 7
    assert call["input"] == "doc"
    assert "service_tier" not in call and "reasoning" not in call


async def test_missing_api_key_is_a_clear_error(settings: Settings) -> None:
    service = LLMService(settings)  # no injected client, OPENAI_API_KEY empty
    with pytest.raises(AppError) as exc:
        await service.text("ocr", input="x")
    assert (exc.value.status_code, exc.value.code) == (503, "LLM_NOT_CONFIGURED")
