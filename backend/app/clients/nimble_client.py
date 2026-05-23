"""Nimble ClinicalTrials.gov integration."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.config import require_env

NIMBLE_EXTRACT_URL = "https://sdk.nimbleway.com/v1/extract"
CT_GOV_SEARCH_BASE = "https://clinicaltrials.gov/search"
CT_GOV_API_BASE = "https://clinicaltrials.gov/api/v2/studies"
CT_GOV_HEALTH_SEARCH_URL = (
    "https://clinicaltrials.gov/search?cond=testicular+cancer&locStr=United+States"
)

NCT_PATTERN = re.compile(r"NCT\d{8}", re.IGNORECASE)


@dataclass(frozen=True)
class TrialSearchParams:
    """Matches POST /find-trials request fields."""

    cancer_type: str = "Testicular Cancer"
    location: str = "United States"
    requirements: str | None = None
    page_size: int = 10


def build_search_url(params: TrialSearchParams) -> str:
    """ClinicalTrials.gov search page (JS-rendered)."""
    cond = quote_plus(params.cancer_type)
    loc = quote_plus(params.location)
    return f"{CT_GOV_SEARCH_BASE}?cond={cond}&locStr={loc}"


def build_api_url(params: TrialSearchParams) -> str:
    """Official CT.gov API v2 — structured JSON, no browser needed."""
    cond = quote_plus(params.cancer_type)
    query = (
        f"{CT_GOV_API_BASE}?query.cond={cond}"
        f"&filter.overallStatus=RECRUITING"
        f"&pageSize={params.page_size}"
    )
    if params.location and params.location.strip():
        # Location filter as free-text geo query (API accepts locStr-style terms)
        loc = quote_plus(params.location.strip())
        query += f"&query.locn={loc}"
    return query


def _extract(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = require_env("NIMBLE_API_KEY").strip()
    with httpx.Client(timeout=180.0) as client:
        response = client.post(
            NIMBLE_EXTRACT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        return response.json()


def extract_search_page(params: TrialSearchParams | None = None) -> dict[str, Any]:
    """Render the CT.gov search UI (vx10) — used for /health/nimble and find-trials scrape."""
    p = params or TrialSearchParams()
    return _extract(
        {
            "url": build_search_url(p),
            "render": True,
            "driver": "vx10",
            "country": "US",
            "locale": "en-US",
            "render_options": {"render_type": "idle2", "timeout": 45000},
            "browser_actions": [{"wait": 8000}],
            "formats": ["html", "markdown"],
            "tag": "tc-copilot-trial-search",
        }
    )


def extract_structured(params: TrialSearchParams) -> dict[str, Any]:
    """
  Fetch structured trial records via Nimble → CT.gov API v2 (vx6, no browser).

  Returns normalized trial dicts ready for Claude trial-finder or direct display.
  """
    nimble_payload = _extract(
        {
            "url": build_api_url(params),
            "render": False,
            "driver": "vx6",
            "formats": ["html"],
            "tag": "tc-copilot-trial-api",
        }
    )
    raw = (nimble_payload.get("data") or {}).get("html") or ""
    api_json = json.loads(raw)
    trials = parse_studies_from_api(api_json)
    return {
        "ok": True,
        "source": "clinicaltrials.gov/api/v2",
        "searchParams": {
            "cancerType": params.cancer_type,
            "location": params.location,
            "requirements": params.requirements,
            "pageSize": params.page_size,
        },
        "resultCount": len(trials),
        "trials": trials,
        "nimble": {
            "taskId": nimble_payload.get("task_id"),
            "status": nimble_payload.get("status"),
            "driver": (nimble_payload.get("metadata") or {}).get("driver"),
        },
    }


def parse_studies_from_api(api_json: dict[str, Any]) -> list[dict[str, Any]]:
    """Map CT.gov API v2 studies[] to a stable shape for Claude / find-trials."""
    out: list[dict[str, Any]] = []
    for study in api_json.get("studies") or []:
        protocol = study.get("protocolSection") or {}
        ident = protocol.get("identificationModule") or {}
        status = protocol.get("statusModule") or {}
        design = protocol.get("designModule") or {}
        contacts = protocol.get("contactsLocationsModule") or {}
        nct_id = ident.get("nctId") or ""
        if not nct_id:
            continue
        phases = design.get("phases") or []
        phase = phases[0] if phases else "Not specified"
        if len(phases) > 1:
            phase = ", ".join(phases)
        locations = contacts.get("locations") or []
        location_parts: list[str] = []
        if locations:
            loc0 = locations[0]
            city = loc0.get("city") or ""
            state = loc0.get("state") or ""
            country = loc0.get("country") or ""
            location_parts = [p for p in (city, state, country) if p]
        location_str = ", ".join(location_parts) if location_parts else "See study page"
        out.append(
            {
                "nctId": nct_id,
                "name": ident.get("briefTitle") or ident.get("officialTitle") or nct_id,
                "phase": phase,
                "location": location_str,
                "status": status.get("overallStatus") or "",
                "url": f"https://clinicaltrials.gov/study/{nct_id}",
                "summarySource": "api",
            }
        )
    return out


def count_trial_results(payload: dict[str, Any]) -> int:
    """Count likely trial hits from Nimble extract payload (search page HTML)."""
    html = ""
    data = payload.get("data") or {}
    if isinstance(data, dict):
        html = data.get("html") or data.get("markdown") or ""
    if not html:
        html = str(payload)
    return len(set(NCT_PATTERN.findall(html)))


def scrape_clinical_trials_search(url: str | None = None) -> dict[str, Any]:
    """Backward-compatible wrapper for health check."""
    if url:
        return _extract({"url": url, "render": True, "driver": "vx10", "browser_actions": [{"wait": 5000}]})
    return extract_search_page()


def health_check() -> dict[str, Any]:
    payload = extract_search_page()
    result_count = count_trial_results(payload)
    if result_count < 1:
        status = payload.get("status")
        raise RuntimeError(
            f"Nimble health check found 0 trials (status={status!r})"
        )
    return {
        "ok": True,
        "resultCount": result_count,
        "nimbleUrl": NIMBLE_EXTRACT_URL,
        "targetUrl": CT_GOV_HEALTH_SEARCH_URL,
    }
