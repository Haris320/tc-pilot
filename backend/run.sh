#!/usr/bin/env bash
# Start the API with Datadog tracing. Works even if `uv` is not on your PATH yet.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f "$HOME/.local/bin/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.local/bin/env"
fi

export PATH="$HOME/.local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

ENV_FILE="app/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE=".env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example to app/.env and fill in keys."
  exit 1
fi

# ddtrace reads DD_* when ddtrace-run starts — must be in the shell env, not only python-dotenv.
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
export DD_LLMOBS_AGENTLESS_ENABLED="${DD_LLMOBS_AGENTLESS_ENABLED:-1}"

exec uv run --env-file "$ENV_FILE" ddtrace-run uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 --reload "$@"
