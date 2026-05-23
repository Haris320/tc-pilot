from fastapi import APIRouter, HTTPException
from ddtrace import tracer

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


@router.get("/health/datadog")
async def health_datadog() -> dict:
    try:
        await anthropic_client.call_claude(
            system="You are a health-check bot. Return JSON only, no markdown.",
            user='Reply with exactly: {"ok": true}',
            feature_tag="symptom-validate",
        )
        clickhouse_client.ping()
        span = tracer.current_root_span() or tracer.current_span()
        trace_id = format(span.trace_id, "x") if span else None
        return {"ok": True, "traceId": trace_id}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "Datadog health check failed", "detail": str(exc)},
        ) from exc


@router.get("/health/nimble")
def health_nimble() -> dict:
    try:
        return nimble_client.health_check()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": "Nimble health check failed", "detail": str(exc)},
        ) from exc
