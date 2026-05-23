"""Agentic trial finder workflow: plan -> nimble_search -> match -> appointment prep."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from ddtrace.llmobs import LLMObs

from app.clients import anthropic_client, clickhouse_client, nimble_client
from app.services import patient_context, trial_search_store
from app.services.patient_context import PatientContext

logger = logging.getLogger(__name__)

PROMPT_A_SYSTEM = (
    "You are a clinical research assistant building inputs for a ClinicalTrials.gov "
    "v2 search via Nimble Extract. Return JSON only. Stage values must start with "
    '"Stage " (e.g. "Stage IIA"). Use Title Case for histology (Seminoma, '
    "Non-seminoma). Profile stage I/II/III is a hint only — prefer detail from the "
    "pathology report when present."
)

PROMPT_B_SYSTEM = (
    "You are a clinical research assistant. Be conservative. Never tell the patient "
    "to enroll. Frame next steps as questions for their oncologist. Return JSON only."
)

PROMPT_C_SYSTEM = (
    "You are helping a testicular cancer patient prepare for their oncologist visit. "
    "Be conservative. Never tell them to enroll in a trial. Return JSON only."
)


# ── Prompt A: plan the ClinicalTrials.gov query ──────────────────────────────


async def plan_trial_search(context: PatientContext) -> dict[str, Any]:
    context_json = json.dumps(context.to_json(), indent=2)
    user = f"""Patient context (profile, latest pathology report, 14-day symptom trends — may be empty):
{context_json}

Build the search inputs for a ClinicalTrials.gov v2 query (Nimble Extract). Return JSON only:
{{
  "cancer_type": "Testicular Cancer",
  "location": "string — patient location for the search; default to profile location, broaden to country if city is too narrow",
  "page_size": 10,
  "must_match_terms": ["Stage IIA", "Seminoma", "RECRUITING", "..."],
  "planning_rationale": "1-2 sentences on what you emphasized for this patient"
}}

Rules:
- cancer_type is almost always "Testicular Cancer".
- location defaults to profile.location; you may broaden (e.g. "United States") when the city is too narrow for good trial sites.
- page_size: integer 5-20 (default 10).
- must_match_terms: short patient-specific tokens used to filter ranked trials in the next step — stage, histology, prior treatment line, recruiting status, surveillance vs. adjuvant, etc. These are NOT sent to Nimble; they steer the match step.
- planning_rationale: shown in the UI as how-we-searched.
"""
    return await anthropic_client.call_claude(
        system=PROMPT_A_SYSTEM,
        user=user,
        feature_tag="trial-finder",
        span_name="plan_trial_search",
        max_tokens=1024,
    )


def build_search_query(
    context: PatientContext, planned: dict[str, Any]
) -> tuple[dict[str, Any], str]:
    """Turn planning JSON into the search_query_used record + planning rationale."""
    if not context.profile:
        raise ValueError("Patient profile required for trial search")
    profile_location = (context.profile.get("location") or "").strip()

    cancer_type = str(planned.get("cancer_type") or "Testicular Cancer").strip() or "Testicular Cancer"
    location = str(planned.get("location") or profile_location or "United States").strip()
    if not location:
        location = "United States"

    try:
        page_size = int(planned.get("page_size") or 10)
    except (TypeError, ValueError):
        page_size = 10
    page_size = max(5, min(page_size, 20))

    must_match_raw = planned.get("must_match_terms") or []
    must_match: list[str] = []
    seen: set[str] = set()
    if isinstance(must_match_raw, list):
        for term in must_match_raw:
            text = str(term).strip()
            if text and text not in seen:
                seen.add(text)
                must_match.append(text)

    rationale = str(planned.get("planning_rationale") or "").strip()

    search_query_used = {
        "cancer_type": cancer_type,
        "location": location,
        "page_size": page_size,
        "must_match_terms": must_match,
    }
    return search_query_used, rationale


# ── Tool: Nimble Extract over CT.gov API v2 ──────────────────────────────────


def run_nimble_search(
    search_query_used: dict[str, Any],
) -> tuple[list[dict[str, Any]], str]:
    """Run Nimble Extract; fall back to cached fixture only when USE_NIMBLE_CACHE=1."""
    source = "live"
    try:
        candidates = nimble_client.search_trials(
            cancer_type=str(search_query_used["cancer_type"]),
            location=str(search_query_used["location"]),
            page_size=int(search_query_used["page_size"]),
            requirements=", ".join(search_query_used.get("must_match_terms") or []) or None,
        )
        return candidates, source
    except Exception as exc:
        if nimble_client.use_nimble_cache_enabled():
            cached = nimble_client.load_cached_trials()
            if cached:
                return cached, "cache"
        raise exc


# ── Prompt B: rank trials for this patient ───────────────────────────────────


async def match_eligibility(
    context: PatientContext,
    candidates: list[dict[str, Any]],
    must_match_terms: list[str],
) -> list[dict[str, Any]]:
    if not candidates:
        return []
    context_json = json.dumps(context.to_json(), indent=2)
    trials_json = json.dumps(candidates, indent=2)
    terms_json = json.dumps(must_match_terms)
    user = f"""Patient context (profile, latest pathology report, 14-day symptom trends):
{context_json}

Must-match terms from the planning step (use as filtering hints, not hard requirements):
{terms_json}

Candidate trials from ClinicalTrials.gov:
{trials_json}

Rank trials best-fit to worst. Omit obvious mismatches (wrong cancer type, clearly incompatible stage or histology). For each retained trial return:
- trial_name (string), url (string), location (string — from trial data if present)
- match_score: 1-10
- eligibility_status: "likely_fit" | "uncertain" | "unlikely_fit"
- match_reasoning: 2-3 sentences specific to THIS patient
- questions_to_ask_oncologist: string[2]

Return JSON: {{ "trials": [ ... ] }}
"""
    parsed = await anthropic_client.call_claude(
        system=PROMPT_B_SYSTEM,
        user=user,
        feature_tag="trial-finder",
        span_name="match_eligibility",
        max_tokens=4096,
    )
    trials = parsed.get("trials")
    if not isinstance(trials, list):
        return []
    return [t for t in trials if isinstance(t, dict)]


# ── Prompt C: appointment prep ───────────────────────────────────────────────


async def build_appointment_prep(
    context: PatientContext,
    ranked_trials: list[dict[str, Any]],
) -> dict[str, Any]:
    context_json = json.dumps(context.to_json(), indent=2)
    trials_json = json.dumps(ranked_trials, indent=2)
    user = f"""Patient context (profile, pathology report + explanation, 14-day symptom trends):
{context_json}

Ranked trials (may be empty):
{trials_json}

Return JSON:
{{
  "appointment_summary": string,
  "questions_to_ask_oncologist": string[],
  "themes": [{{ "heading": string, "questions": string[] }}]
}}

appointment_summary: 2-4 sentences tying pathology, symptoms, and top trial options.
questions_to_ask_oncologist: 5-8 consolidated questions (dedupe trial-specific ones).
themes: 2-4 short groupings of related questions (e.g. "Treatment plan", "Side effects", "Trial logistics").
"""
    return await anthropic_client.call_claude(
        system=PROMPT_C_SYSTEM,
        user=user,
        feature_tag="trial-finder",
        span_name="build_appointment_prep",
        max_tokens=2048,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _normalize_ranked_trial(
    row: dict[str, Any], candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    by_url = {c.get("url"): c for c in candidates if c.get("url")}
    url = str(row.get("url") or "")
    base = by_url.get(url, {})
    name = row.get("trial_name") or row.get("name") or base.get("name") or "Clinical trial"
    location = row.get("location") or base.get("location") or "See study page"
    return {
        "name": str(name),
        "phase": str(base.get("phase") or row.get("phase") or "Not specified"),
        "location": str(location),
        "summary": str(row.get("match_reasoning") or base.get("summary") or ""),
        "eligibility": str(
            row.get("eligibility_status") or base.get("eligibility") or ""
        ),
        "url": url or str(base.get("url") or ""),
        "match_score": row.get("match_score"),
        "eligibility_status": row.get("eligibility_status"),
        "match_reasoning": row.get("match_reasoning"),
        "questions_to_ask_oncologist": row.get("questions_to_ask_oncologist") or [],
        "nctId": base.get("nctId"),
        "status": base.get("status"),
    }


# ── Workflow entry point ─────────────────────────────────────────────────────


async def find_trials_for_patient(
    patient_id: str, *, run_id: str | None = None
) -> None:
    """Background job entry: full workflow with LLMObs instrumentation."""
    pathology_report_id = ""
    active_run_id = run_id

    with LLMObs.workflow(name="find_trials_for_patient"):
        try:
            with LLMObs.tool(name="load_patient_context"):
                context = patient_context.load_patient_context(patient_id)
                pathology = patient_context.require_pathology(context)
                pathology_report_id = str(pathology["id"])

            if not active_run_id:
                active_run_id = trial_search_store.insert_pending_run(
                    patient_id, pathology_report_id
                )

            if not context.profile:
                raise ValueError("Patient profile required")

            with LLMObs.tool(name="plan_trial_search"):
                planned = await plan_trial_search(context)

            search_query_used, planning_rationale = build_search_query(context, planned)

            with LLMObs.tool(name="nimble_search"):
                candidates, source = run_nimble_search(search_query_used)

            with LLMObs.tool(name="match_eligibility"):
                ranked_raw = await match_eligibility(
                    context, candidates, search_query_used["must_match_terms"]
                )

            ranked = [_normalize_ranked_trial(r, candidates) for r in ranked_raw]

            with LLMObs.tool(name="build_appointment_prep"):
                prep = await build_appointment_prep(context, ranked)

            appointment_summary = str(prep.get("appointment_summary") or "")
            questions = [
                str(q)
                for q in (prep.get("questions_to_ask_oncologist") or [])
                if q
            ]
            themes = prep.get("themes")
            if not isinstance(themes, list):
                themes = []

            trial_search_store.complete_run(
                active_run_id,
                patient_id,
                pathology_report_id,
                search_query_used=search_query_used,
                planning_rationale=planning_rationale,
                trials=ranked,
                appointment_summary=appointment_summary,
                questions=questions,
                themes=themes,
                source=source,
            )

            _fan_out_trial_questions(patient_id, ranked, questions)

        except Exception as exc:
            logger.exception("find_trials_for_patient failed for %s", patient_id)
            if active_run_id:
                trial_search_store.fail_run(
                    active_run_id,
                    patient_id,
                    str(exc),
                    pathology_report_id=pathology_report_id,
                )
        finally:
            LLMObs.flush()


def _fan_out_trial_questions(
    patient_id: str,
    ranked: list[dict[str, Any]],
    consolidated: list[str],
) -> None:
    """Optional fan-out to doctor-questions with source trial-search."""
    texts: list[str] = list(consolidated)
    for trial in ranked:
        for q in trial.get("questions_to_ask_oncologist") or []:
            if q and q not in texts:
                texts.append(str(q))
    if not texts:
        return

    existing_rows = clickhouse_client.query_all(
        """
        SELECT text FROM doctor_questions FINAL
        WHERE patient_id = {pid:String} AND source = {src:String}
        """,
        {"pid": patient_id, "src": "trial-search"},
    )
    existing = {r["text"] for r in existing_rows}
    to_insert = [
        [str(uuid.uuid4()), patient_id, "trial-search", t, 0]
        for t in texts
        if t not in existing
    ]
    if to_insert:
        clickhouse_client.insert_rows(
            "doctor_questions",
            to_insert,
            column_names=["id", "patient_id", "source", "text", "done"],
        )


def can_start_trial_search(patient_id: str) -> bool:
    ctx = patient_context.load_patient_context(patient_id)
    return bool(ctx.profile and ctx.pathology)
