import os

from fastapi import APIRouter, HTTPException
from ddtrace import tracer
from ddtrace.llmobs import LLMObs

from app.clients import anthropic_client, clickhouse_client, nimble_client

router = APIRouter(tags=["health"])


@router.get("/")
def root() -> dict:
    return {"ok": True, "service": "tc-copilot"}


@router.post("/setup")
def setup() -> dict:
    try:
        tables = clickhouse_client.setup_tables()
        return {"ok": True, "tables": tables}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "ClickHouse setup failed", "detail": str(exc)},
        ) from exc


@router.get("/health/clickhouse")
def health_clickhouse() -> dict:
    try:
        return clickhouse_client.health_check_write_read()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "ClickHouse health check failed", "detail": str(exc)},
        ) from exc


@router.get("/health/claude")
async def health_claude() -> dict:
    try:
        parsed = await anthropic_client.call_claude(
            system="You are a health-check bot. Return JSON only, no markdown.",
            user='Reply with exactly: {"ok": true, "ping": "pong"}',
            feature_tag="symptom-validate",
        )
        return {"ok": True, "echo": parsed}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "Claude health check failed", "detail": str(exc)},
        ) from exc


@router.get("/health/datadog/config")
def health_datadog_config() -> dict:
    """Safe diagnostics — no secrets. Use when LLM Observability spans are missing."""
    return {
        "llmobsEnabled": LLMObs.enabled,
        "ddApiKeySet": bool(os.getenv("DD_API_KEY")),
        "ddSite": os.getenv("DD_SITE"),
        "ddService": os.getenv("DD_SERVICE"),
        "ddEnv": os.getenv("DD_ENV"),
        "ddMlApp": os.getenv("DD_LLMOBS_ML_APP"),
        "ddLlmobsAgentless": os.getenv("DD_LLMOBS_AGENTLESS_ENABLED"),
        "hint": (
            "Use GET /health/llmobs for LLM Observability. Use GET /health/datadog for "
            "APM + LLMObs combined. Start with ./run.sh and DD_LLMOBS_AGENTLESS_ENABLED=1."
        ),
    }


@router.get("/health/llmobs")
async def health_llmobs() -> dict:
    """LLM Observability gate — one Claude call with prompt, completion, and cost metrics."""
    feature_tag = "symptom-validate"
    try:
        parsed = await anthropic_client.call_claude(
            system="You are a health-check bot for Datadog LLM Observability. Return JSON only.",
            user='Reply with exactly: {"ok": true, "product": "llmobs"}',
            feature_tag=feature_tag,
        )
        LLMObs.flush()
        return {
            "ok": True,
            "product": "llmobs",
            "mlApp": os.getenv("DD_LLMOBS_ML_APP", "tc-copilot"),
            "featureTag": feature_tag,
            "echo": parsed,
            "datadogUi": (
                "Datadog → LLM Observability → filter ml_app:tc-copilot env:development "
                f"feature:{feature_tag}"
            ),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "LLM Observability health check failed", "detail": str(exc)},
        ) from exc


@router.get("/health/datadog")
async def health_datadog() -> dict:
    """APM + LLMObs combined gate (Phase 1 spec)."""
    try:
        llm = await anthropic_client.call_claude(
            system="You are a health-check bot. Return JSON only, no markdown.",
            user='Reply with exactly: {"ok": true}',
            feature_tag="symptom-validate",
        )
        clickhouse_client.ping()
        LLMObs.flush()
        span = tracer.current_root_span() or tracer.current_span()
        trace_id = format(span.trace_id, "x") if span else None
        return {
            "ok": True,
            "traceId": trace_id,
            "apm": "Check APM → Traces with this traceId",
            "llmobs": llm,
            "llmobsUi": "Datadog → LLM Observability → ml_app:tc-copilot",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "Datadog health check failed", "detail": str(exc)},
        ) from exc


@router.get("/health/nimble")
def health_nimble() -> dict:
    """Nimble gate: live CT.gov scrape + httpx outbound span in APM."""
    try:
        result = nimble_client.health_check()
        tracer.flush()
        span = tracer.current_root_span() or tracer.current_span()
        trace_id = format(span.trace_id, "x") if span else None
        return {
            **result,
            "traceId": trace_id,
            "apm": (
                "APM → Traces → search traceId, look for outbound POST "
                "sdk.nimbleway.com (httpx)"
            ),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "Nimble health check failed", "detail": str(exc)},
        ) from exc
