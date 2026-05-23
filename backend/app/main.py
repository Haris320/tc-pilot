import app.bootstrap_env  # noqa: F401 — must run before other app imports

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

if os.getenv("DD_LLMOBS_ENABLED", "").strip() in {"1", "true", "True"}:
    from ddtrace.llmobs import LLMObs

    LLMObs.enable()

from app.config import frontend_origin
from app.routes import health

app = FastAPI(title="TC Co-pilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


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
