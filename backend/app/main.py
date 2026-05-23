import app.bootstrap_env  # noqa: F401 — must run before other app imports

import os

import ddtrace

# Outbound Nimble calls use httpx — patch so APM shows an external POST span.
ddtrace.patch(httpx=True)

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

if os.getenv("DD_LLMOBS_ENABLED", "").strip() in {"1", "true", "True"}:
    from ddtrace.llmobs import LLMObs

    # Local dev has no Agent on localhost:8126 — agentless sends LLM spans to Datadog directly.
    LLMObs.enable(
        ml_app=os.getenv("DD_LLMOBS_ML_APP", "tc-copilot"),
        api_key=os.getenv("DD_API_KEY"),
        site=os.getenv("DD_SITE", "datadoghq.com"),
        env=os.getenv("DD_ENV", "development"),
        service=os.getenv("DD_SERVICE", "tc-copilot"),
        agentless_enabled=os.getenv("DD_LLMOBS_AGENTLESS_ENABLED", "1").strip()
        in {"1", "true", "True"},
    )

from contextlib import asynccontextmanager

from app.clients import clickhouse_client
from app.config import frontend_origin
from app.routes import admin, analytics, health, pathology, profile, questions, symptoms


@asynccontextmanager
async def lifespan(_: "FastAPI"):
    # Auto-create tables on every startup — idempotent, never blocks feature work.
    try:
        clickhouse_client.setup_tables()
    except Exception as exc:
        print(f"[startup] ClickHouse setup failed (non-fatal): {exc}")
    yield


app = FastAPI(title="TC Co-pilot API", version="0.1.0", lifespan=lifespan)

_origins = [frontend_origin()]
if "localhost:3000" not in frontend_origin():
    _origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Patient-Id", "Authorization"],
    expose_headers=["X-Patient-Id"],
)

app.include_router(health.router)
app.include_router(profile.router)
app.include_router(symptoms.router)
app.include_router(pathology.router)
app.include_router(questions.router)
app.include_router(admin.router)
app.include_router(analytics.router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "message" in detail:
        body = detail
    elif isinstance(detail, str):
        body = {"message": detail}
    else:
        body = {"message": "Request failed", "detail": detail}
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
):
    return JSONResponse(
        status_code=422,
        content={"message": "Validation error", "detail": exc.errors()},
    )
