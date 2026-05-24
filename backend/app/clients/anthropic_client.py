"""Anthropic Claude wrapper with Datadog LLMObs cost metrics."""

from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from typing import Any, Callable, Iterator

from anthropic import Anthropic
from ddtrace.llmobs import LLMObs

from app.config import require_env

_log = logging.getLogger(__name__)

# USD per 1M tokens — verify against Anthropic pricing on build day.
MODEL_PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
    "claude-haiku-4-5-20251001": {"input": 1.00, "output": 5.00},
}

DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

ALLOWED_FEATURE_TAGS = frozenset(
    {
        "pathology",
        "symptom-validate",
        "symptom-summary",
        "trial-finder",
        "doctor-questions",
    }
)

_client: Anthropic | None = None


def _cost(tokens: int, rate_per_million: float) -> float:
    return tokens * rate_per_million / 1_000_000


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=require_env("ANTHROPIC_API_KEY"))
    return _client


def _parse_json_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
        return {"raw": parsed}
    except json.JSONDecodeError:
        return {"raw": text}


@contextmanager
def feature_workflow(
    name: str,
    *,
    patient_id: str | None = None,
    stage: str | None = None,
) -> Iterator[Any]:
    """Top-level workflow span for a feature handler.

    Wraps LLMObs.workflow() and tags patient_id / stage so judges can filter
    the LLMObs trace list by patient session.
    """
    with LLMObs.workflow(name=name) as span:
        tags: dict[str, str] = {}
        if patient_id:
            tags["patient_id"] = patient_id
        if stage:
            tags["stage"] = stage
        if tags:
            LLMObs.annotate(span=span, tags=tags)
        yield span


@contextmanager
def feature_task(name: str) -> Iterator[Any]:
    """Child task span — used for ClickHouse read/write inside a feature workflow."""
    with LLMObs.task(name=name) as span:
        yield span


async def call_claude(
    system: str,
    user: str,
    *,
    feature_tag: str,
    model: str | None = None,
    span_name: str | None = None,
    max_tokens: int = 1024,
    patient_id: str | None = None,
    eval_fn: Callable[[dict[str, Any]], dict[str, float]] | None = None,
) -> dict[str, Any]:
    """Call Claude, annotate LLMObs span, return parsed JSON (or {"raw": text}).

    Optional:
        span_name:  override the LLM span name (defaults to feature_tag).
        max_tokens: max output tokens for the Anthropic call.
        patient_id: tagged onto the LLM span for per-patient filtering.
        eval_fn:    given the parsed response, returns {label: score} pairs
                    which are submitted as LLMObs evaluations on this span.
    """
    if feature_tag not in ALLOWED_FEATURE_TAGS:
        raise ValueError(f"Invalid feature_tag: {feature_tag!r}")

    chosen_model = model or DEFAULT_MODEL
    prices = MODEL_PRICES.get(chosen_model, MODEL_PRICES["claude-sonnet-4-20250514"])
    llm_span_name = span_name or feature_tag

    with LLMObs.llm(
        model_name=chosen_model,
        model_provider="anthropic",
        name=llm_span_name,
    ) as span:
        response = _get_client().messages.create(
            model=chosen_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )

        text_blocks = [
            block.text for block in response.content if block.type == "text"
        ]
        text = "\n".join(text_blocks).strip()

        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        input_cost = _cost(input_tokens, prices["input"])
        output_cost = _cost(output_tokens, prices["output"])
        total_cost = input_cost + output_cost

        tags: dict[str, Any] = {
            "feature": feature_tag,
            "model": chosen_model,
            "span_name": llm_span_name,
        }
        if patient_id:
            tags["patient_id"] = patient_id

        LLMObs.annotate(
            span=span,
            input_data=[{"role": "user", "content": user}],
            output_data=[{"role": "assistant", "content": text}],
            metrics={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "input_cost_usd": input_cost,
                "output_cost_usd": output_cost,
                "total_cost_usd": total_cost,
            },
            tags=tags,
            metadata={"system": system},
        )

        parsed = _parse_json_text(text)

        if eval_fn is not None:
            try:
                scores = eval_fn(parsed)
                exported = LLMObs.export_span(span)
                if exported:
                    for label, value in scores.items():
                        LLMObs.submit_evaluation(
                            label=label,
                            metric_type="score",
                            value=float(value),
                            span=exported,
                        )
            except Exception:
                _log.exception("LLMObs eval_fn failed for feature=%s", feature_tag)

        return parsed
