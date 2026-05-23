# TC Co-pilot — Backend

FastAPI API for the TC Co-pilot hackathon project. All sponsor integrations live in `app/clients/`.

## Setup

```bash
cd backend
cp .env.example .env   # fill in keys
uv sync
```

## Run (with Datadog tracing)

```bash
cd backend
./run.sh
```

Or manually (if `uv` is on your PATH):

```bash
source "$HOME/.local/bin/env"   # once per terminal, if `uv` not found
cd backend
uv run --env-file app/.env ddtrace-run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--env-file` ensures Datadog/Anthropic keys are in the process env **before** `ddtrace-run` starts (required for LLMObs).

**`zsh: command not found: uv`** — run `source "$HOME/.local/bin/env"` or use `./run.sh`.

## Datadog LLM Observability not showing?

Most common causes on a fresh laptop:

1. **No local Datadog Agent** — LLM spans default to `localhost:8126` and are dropped. Set in `app/.env`:
   ```
   DD_LLMOBS_AGENTLESS_ENABLED=1
   ```
   Always start with `./run.sh` (loads env before `ddtrace-run`).

2. **Wrong start command** — `uvicorn app.main:app` without `ddtrace-run` or without `--env-file` → no traces.

3. **`DD_SITE` mismatch** — US key needs `datadoghq.com`, EU key needs `datadoghq.eu`.

4. **LLM Observability only** — `curl http://localhost:8000/health/llmobs` then open **LLM Observability** (not APM).
5. **Config** — `curl http://localhost:8000/health/datadog/config`
6. **APM + LLMObs combined** — `curl http://localhost:8000/health/datadog` (traceId is for **APM**; LLM spans are under LLM Observability).

**Nimble / httpx spans** (`GET /health/nimble`) show in **APM → Traces** as an outbound `POST sdk.nimbleway.com`. That requires a Datadog Agent (LLM Observability agentless does not cover APM):

For **APM traces** (Nimble httpx, FastAPI requests), run a local Agent:
```bash
docker run -d --name dd-agent -e DD_API_KEY=$DD_API_KEY -e DD_SITE=$DD_SITE -p 8126:8126 gcr.io/datadog/agent:latest
```

Hello world: `curl http://localhost:8000/`

## Layout

```
app/
  main.py              # FastAPI app, CORS, error shape
  deps.py              # X-Patient-Id dependency
  models.py            # Pydantic shapes (Phase 2)
  clients/
    anthropic_client.py
    clickhouse_client.py
    nimble_client.py
  routes/
    health.py          # / + Phase 1 health gates
```

Phase 1 adds `/setup` and `/health/*` before any feature routes.
