"""Symptom tracker endpoints — list, log, validate, summarise, chart."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from ddtrace.llmobs import LLMObs

from app.clients import anthropic_client, clickhouse_client
from app.deps import get_patient_id
from app.models import (
    ChartResponse,
    OkResponse,
    Symptom,
    SymptomList,
    SymptomLogIn,
    SymptomSummaryOut,
    SymptomValidateIn,
    SymptomValidateOut,
)

router = APIRouter(tags=["symptoms"])

PatientId = Annotated[str, Depends(get_patient_id)]

DEFAULT_SYMPTOMS: list[tuple[str, str]] = [
    ("fatigue", "Fatigue"),
    ("nausea", "Nausea"),
    ("neuropathy", "Neuropathy (Hand/Foot Tingling)"),
    ("pain", "Pain"),
]


@router.post("/symptoms/seed", response_model=SymptomList)
def seed_symptoms(patient_id: PatientId) -> SymptomList:
    """Insert the four default trackers for a new patient. Idempotent on (patient_id, symptom_name)."""
    rows = [
        [patient_id, slug, display, 1] for slug, display in DEFAULT_SYMPTOMS
    ]
    clickhouse_client.insert_rows(
        "patient_symptoms",
        rows,
        column_names=["patient_id", "symptom_name", "display_name", "is_default"],
    )
    return _list_symptoms(patient_id)


@router.get("/symptoms", response_model=SymptomList)
def list_symptoms(patient_id: PatientId) -> SymptomList:
    return _list_symptoms(patient_id)


def _list_symptoms(patient_id: str) -> SymptomList:
    rows = clickhouse_client.query_all(
        """
        SELECT symptom_name, display_name, is_default
        FROM patient_symptoms FINAL
        WHERE patient_id = {pid:String}
        ORDER BY is_default DESC, added_at ASC
        """,
        {"pid": patient_id},
    )
    return SymptomList(
        symptoms=[
            Symptom(
                symptom_name=r["symptom_name"],
                display_name=r["display_name"],
                is_default=bool(r["is_default"]),
            )
            for r in rows
        ]
    )


@router.post("/symptom-log", response_model=OkResponse)
def log_symptoms(body: SymptomLogIn, patient_id: PatientId) -> OkResponse:
    if not body.scores:
        return OkResponse(ok=True)
    # Write logged_at explicitly (UTC, naive — matches the ClickHouse DateTime
    # column's server timezone) so the 14-day window query always matches.
    # Relying on the schema DEFAULT now() round-trips through clickhouse-connect
    # inconsistently; the admin seed already uses this same pattern.
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [[patient_id, now_utc, s.symptom_name, s.score] for s in body.scores]
    clickhouse_client.insert_rows(
        "symptom_logs",
        rows,
        column_names=["patient_id", "logged_at", "symptom_name", "score"],
    )
    return OkResponse(ok=True)


@router.post("/symptom-validate", response_model=SymptomValidateOut)
async def validate_symptom(body: SymptomValidateIn, patient_id: PatientId) -> SymptomValidateOut:
    with anthropic_client.feature_workflow("symptom-validate", patient_id=patient_id):
        system = (
            "You are a medical knowledge assistant for a testicular cancer patient tracking app.\n\n"
            "Determine whether the described symptom is a known or commonly reported side effect of "
            "testicular cancer or its standard treatments — BEP chemotherapy (bleomycin, etoposide, "
            "cisplatin), orchiectomy, or radiation.\n\n"
            "Examples of VALID: fatigue, nausea, neuropathy, tinnitus, hearing loss, hair loss, mouth "
            "sores, appetite loss, shortness of breath, swelling, back pain, abdominal pain, fever, "
            "bruising, cognitive fog.\n\n"
            "If valid: set valid=true, provide a symptom_name slug (lowercase, no spaces), a clear "
            "display_name, and a one-sentence explanation of relevance.\n"
            "If not: set valid=false and write a compassionate one-sentence message encouraging the "
            "patient to mention it to their doctor.\n\n"
            'Return JSON: {"valid": boolean, "symptom_name": string, "display_name": string, '
            '"message": string}. No markdown, no preamble.'
        )

        def _evals(parsed: dict) -> dict[str, float]:
            return {
                "accepted": 1.0 if parsed.get("valid") else 0.0,
                "clean_json": 0.0 if "raw" in parsed else 1.0,
            }

        parsed = await anthropic_client.call_claude(
            system=system,
            user=body.symptomText,
            feature_tag="symptom-validate",
            patient_id=patient_id,
            eval_fn=_evals,
        )
        out = SymptomValidateOut(
            valid=bool(parsed.get("valid")),
            symptom_name=parsed.get("symptom_name") or None,
            display_name=parsed.get("display_name") or None,
            message=str(parsed.get("message") or "Mention it to your oncologist."),
        )
        if out.valid and out.symptom_name and out.display_name:
            with anthropic_client.feature_task("clickhouse-write"):
                clickhouse_client.insert_rows(
                    "patient_symptoms",
                    [[patient_id, out.symptom_name, out.display_name, 0]],
                    column_names=["patient_id", "symptom_name", "display_name", "is_default"],
                )
        return out


@router.get("/symptoms/chart", response_model=ChartResponse)
def chart(patient_id: PatientId) -> ChartResponse:
    rows = clickhouse_client.query_all(
        """
        SELECT toDate(logged_at) AS day, symptom_name, avg(score) AS score
        FROM symptom_logs
        WHERE patient_id = {pid:String}
          AND logged_at >= now() - INTERVAL 14 DAY
        GROUP BY day, symptom_name
        ORDER BY day ASC
        """,
        {"pid": patient_id},
    )
    pivot: dict[str, dict] = {}
    for r in rows:
        day = str(r["day"])
        bucket = pivot.setdefault(day, {"day": day})
        bucket[r["symptom_name"]] = round(float(r["score"]), 2)
    return ChartResponse(rows=list(pivot.values()))


@router.get("/symptom-summary", response_model=SymptomSummaryOut)
async def symptom_summary(patient_id: PatientId) -> SymptomSummaryOut:
    with anthropic_client.feature_workflow("symptom-summary", patient_id=patient_id):
        with anthropic_client.feature_task("clickhouse-read") as read_span:
            rows = clickhouse_client.query_all(
                """
                SELECT toDate(logged_at) AS day, symptom_name, round(avg(score), 2) AS score
                FROM symptom_logs
                WHERE patient_id = {pid:String}
                  AND logged_at >= now() - INTERVAL 14 DAY
                GROUP BY day, symptom_name
                ORDER BY day ASC
                """,
                {"pid": patient_id},
            )
            LLMObs.annotate(span=read_span, metrics={"rows_fetched": len(rows)})

        if not rows:
            return SymptomSummaryOut(
                summary="No symptom logs in the past two weeks yet. Track a few days and a trend summary will appear here.",
                alerts=[],
            )

        data_for_claude = [
            {"day": str(r["day"]), "symptom": r["symptom_name"], "score": float(r["score"])}
            for r in rows
        ]
        system = (
            "You are helping a testicular cancer patient understand how their symptoms have changed "
            "over the past two weeks of chemotherapy treatment.\n\n"
            "Given symptom log data (scored 1-10, higher = worse), write a brief plain-English "
            "summary of what the trends show. The symptom list may vary per patient — work with "
            "whatever symptoms are present in the data.\n\n"
            "Identify any symptoms that have increased by 2 or more points over the period — these "
            "are worth flagging to their oncologist.\n\n"
            "Be compassionate but direct. Keep the summary to 3-4 sentences.\n"
            'Return JSON: {"summary": string, "alerts": string[]}. No markdown, no preamble.'
        )

        def _evals(parsed: dict) -> dict[str, float]:
            alerts = parsed.get("alerts") or []
            summary_text = str(parsed.get("summary") or "")
            return {
                "alert_count": float(len(alerts)),
                "summary_words": float(len(summary_text.split())),
                "clean_json": 0.0 if "raw" in parsed else 1.0,
            }

        # Haiku 4.5 — 3-5x faster than Sonnet for this summarisation workload
        # and the structured JSON output stays clean. Cost drops ~3x too.
        parsed = await anthropic_client.call_claude(
            system=system,
            user=json.dumps(data_for_claude),
            feature_tag="symptom-summary",
            model="claude-haiku-4-5",
            patient_id=patient_id,
            eval_fn=_evals,
        )
        return SymptomSummaryOut(
            summary=str(parsed.get("summary") or ""),
            alerts=[str(a) for a in (parsed.get("alerts") or [])],
        )
