"""Nimble ClinicalTrials.gov scraper."""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.config import require_env

NIMBLE_EXTRACT_URL = "https://sdk.nimbleway.com/v1/extract"
CT_GOV_HEALTH_SEARCH_URL = (
    "https://clinicaltrials.gov/search?cond=testicular+cancer&locStr=United+States"
)

NCT_PATTERN = re.compile(r"NCT\d{8}", re.IGNORECASE)


def scrape_clinical_trials_search(url: str | None = None) -> dict[str, Any]:
    """Render a ClinicalTrials.gov search page via Nimble Extract."""
    api_key = require_env("NIMBLE_API_KEY").strip()
    target_url = url or CT_GOV_HEALTH_SEARCH_URL
    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            NIMBLE_EXTRACT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"url": target_url, "render": True},
        )
        response.raise_for_status()
        return response.json()


def count_trial_results(payload: dict[str, Any]) -> int:
    """Count likely trial hits from Nimble extract payload."""
    html = ""
    data = payload.get("data") or {}
    if isinstance(data, dict):
        html = data.get("html") or data.get("markdown") or ""
    if not html:
        html = str(payload)
    return len(set(NCT_PATTERN.findall(html)))


def health_check() -> dict[str, Any]:
    payload = scrape_clinical_trials_search()
    result_count = count_trial_results(payload)
    if result_count < 1:
        status = payload.get("status")
        raise RuntimeError(
            f"Nimble health check found 0 trials (status={status!r})"
        )
    return {"ok": True, "resultCount": result_count}
