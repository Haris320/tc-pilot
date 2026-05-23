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
