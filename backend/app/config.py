import os

import app.bootstrap_env  # noqa: F401


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def frontend_origin() -> str:
    return os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
