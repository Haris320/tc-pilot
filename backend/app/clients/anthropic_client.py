"""Anthropic Claude wrapper with Datadog LLMObs cost metrics."""

from __future__ import annotations

import json
import os
from typing import Any

from anthropic import Anthropic
from ddtrace.llmobs import LLMObs

from app.config import require_env

# USD per 1M tokens — verify against Anthropic pricing on build day.
MODEL_PRICES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
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


async def call_claude(
    system: str,
    user: str,
    *,
    feature_tag: str,
    model: str | None = None,
    span_name: str | None = None,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    """Call Claude, annotate LLMObs span, return parsed JSON (or {"raw": text})."""
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
            tags={
                "feature": feature_tag,
                "model": chosen_model,
                "span_name": llm_span_name,
            },
            metadata={"system": system},
        )

        return _parse_json_text(text)
