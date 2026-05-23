"""Load .env before any sponsor client or ddtrace LLMObs usage."""

from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_APP_ROOT = Path(__file__).resolve().parent

load_dotenv(_BACKEND_ROOT / ".env")
load_dotenv(_APP_ROOT / ".env", override=True)
