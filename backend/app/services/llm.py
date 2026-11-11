"""The single OpenAI wrapper.

Every model call in the app goes through :class:`LLMService`: Responses API with
structured outputs (:meth:`parse`), plain text (:meth:`text`, used for vision OCR) and
the Decisions API (:meth:`decide`). Model, service tier, reasoning effort and timeout all
come from settings; no call site names any of them.

Service-tier fallback: requests use ``LLM_SERVICE_TIER`` (``flex``). Flex can queue and can
be refused for capacity, so a timeout, connection error, 429 or 5xx on the primary tier is
retried **once** on ``LLM_FALLBACK_SERVICE_TIER`` (empty disables the retry). The SDK's own
retries are switched off (``max_retries=0``) so a flex timeout costs one timeout, not
three. The Decisions API takes no service tier (see the master plan) and uses a short
timeout with the SDK's normal retries.
"""

from __future__ import annotations

import base64
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, TypeVar

import openai
from fastapi import Depends
from openai import AsyncOpenAI, omit
from pydantic import BaseModel

from app.config import ReasoningTask, Settings, get_settings
from app.errors import AppError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
R = TypeVar("R")

# Failures worth one retry on the fallback tier: the request may simply not have been
# served (queued too long, no flex capacity, transient upstream error).
_RETRYABLE = (openai.APIConnectionError, openai.RateLimitError, openai.InternalServerError)


class LLMError(AppError):
    """Upstream model failure, mapped to a stable API error."""


def _timeout_error() -> LLMError:
    return LLMError(504, "LLM_TIMEOUT", "The AI model took too long to respond. Try again.")


def _unavailable_error() -> LLMError:
    return LLMError(502, "LLM_UNAVAILABLE", "The AI model is unavailable right now. Try again shortly.")


def _bad_output_error(reason: str) -> LLMError:
    return LLMError(502, "LLM_BAD_OUTPUT", "The AI model returned an unusable answer.", {"reason": reason})


def image_data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def image_input(prompt: str, images: list[bytes]) -> list[dict[str, Any]]:
    """A single user message holding ``prompt`` followed by PNG page images."""
    content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    content.extend(
        {"type": "input_image", "image_url": image_data_url(png), "detail": "high"} for png in images
    )
    return [{"role": "user", "content": content}]


class LLMService:
    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None) -> None:
        self._settings = settings
        self._client = client

    @property
    def client(self) -> AsyncOpenAI:
        # Built lazily so the app starts (and tests run) without an API key.
        if self._client is None:
            if not self._settings.openai_api_key:
                raise AppError(503, "LLM_NOT_CONFIGURED", "The AI service is not configured.")
            self._client = AsyncOpenAI(api_key=self._settings.openai_api_key, max_retries=0)
        return self._client

    # ── tier fallback ───────────────────────────────────────────────────────

    async def _with_fallback(self, call: Callable[[Any], Awaitable[R]]) -> R:
        """Run ``call(service_tier)``; retry once on the fallback tier if the primary fails."""
        primary = self._settings.llm_service_tier or None
        fallback = self._settings.fallback_service_tier
        started = time.perf_counter()
        try:
            result = await call(primary if primary else omit)
            logger.info(
                "LLM call ok: model=%s tier=%s %.1fs",
                self._settings.llm_model,
                primary or "default",
                time.perf_counter() - started,
            )
            return result
        except _RETRYABLE as exc:
            if fallback and fallback != primary:
                logger.warning(
                    "LLM call failed on tier %r after %.1fs (%s); retrying once on %r",
                    primary,
                    time.perf_counter() - started,
                    exc.__class__.__name__,
                    fallback,
                )
                retry_started = time.perf_counter()
                try:
                    result = await call(fallback)
                except openai.OpenAIError as retry_exc:
                    raise self._to_error(retry_exc) from retry_exc
                logger.info(
                    "LLM call ok on fallback: model=%s tier=%s %.1fs",
                    self._settings.llm_model,
                    fallback,
                    time.perf_counter() - retry_started,
                )
                return result
            raise self._to_error(exc) from exc
        except openai.OpenAIError as exc:
            raise self._to_error(exc) from exc

    @staticmethod
    def _to_error(exc: openai.OpenAIError) -> LLMError:
        if isinstance(exc, openai.APITimeoutError):
            return _timeout_error()
        if isinstance(exc, _RETRYABLE):
            return _unavailable_error()
        # Auth/permission/bad-request: our bug or config, not the user's. Log, don't leak.
        logger.error("OpenAI call rejected: %s: %s", exc.__class__.__name__, exc)
        return LLMError(502, "LLM_ERROR", "The AI model could not process this request.")

    def _reasoning(self, task: ReasoningTask) -> dict[str, str]:
        return {"effort": self._settings.reasoning_effort_for(task)}

    # ── Responses API ───────────────────────────────────────────────────────

    async def parse(
        self,
        task: ReasoningTask,
        *,
        instructions: str,
        input: str | list[dict[str, Any]],
        schema: type[T],
    ) -> T:
        """Structured output: the model's answer validated into ``schema``."""

        async def _call(tier: Any) -> Any:
            return await self.client.responses.parse(
                model=self._settings.llm_model,
                instructions=instructions,
                input=input,
                text_format=schema,
                reasoning=self._reasoning(task),
                service_tier=tier,
                timeout=self._settings.llm_timeout_seconds,
                store=False,
            )

        response = await self._with_fallback(_call)
        parsed = getattr(response, "output_parsed", None)
        if parsed is None:
            raise _bad_output_error("refusal or empty structured output")
        return parsed

    async def text(
        self,
        task: ReasoningTask,
        *,
        instructions: str | None = None,
        input: str | list[dict[str, Any]],
    ) -> str:
        """Plain-text answer (vision OCR transcription)."""

        async def _call(tier: Any) -> Any:
            return await self.client.responses.create(
                model=self._settings.llm_model,
                instructions=instructions if instructions else omit,
                input=input,
                reasoning=self._reasoning(task),
                service_tier=tier,
                timeout=self._settings.llm_timeout_seconds,
                store=False,
            )

        response = await self._with_fallback(_call)
        return (getattr(response, "output_text", "") or "").strip()

    # ── Decisions API ───────────────────────────────────────────────────────

    async def decide(self, *, input: str, questions: list[dict[str, Any]]) -> Any:
        """``POST /v1/decisions``: answers come back in question order.

        Returns the SDK's ``Decision`` (``.answers`` are predicate / choice / score /
        refusal objects). No service tier: the Decisions API does not take one.
        """
        try:
            return await self.client.with_options(max_retries=2).decisions.create(
                model=self._settings.decision_model,
                input=input,
                questions=questions,
                timeout=self._settings.decision_timeout_seconds,
            )
        except openai.OpenAIError as exc:
            raise self._to_error(exc) from exc


_services: dict[int, LLMService] = {}


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> LLMService:
    """FastAPI dependency: one service (and one HTTP client) per settings object.

    Override in tests with a fake exposing ``parse`` / ``text`` / ``decide``.
    """
    service = _services.get(id(settings))
    if service is None or service._settings is not settings:
        service = _services[id(settings)] = LLMService(settings)
    return service
