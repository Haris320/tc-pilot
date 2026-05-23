"""Pathology report translator — translate, persist, and retrieve history."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.agents import trial_finder
from app.clients import anthropic_client, clickhouse_client
from app.deps import get_patient_id
from app.services import patient_context, trial_search_store
from app.models import (
    PathologyReport,
    PathologyReportList,
    TranslateReportIn,
    TranslateReportOut,
)

router = APIRouter(tags=["pathology"])

PatientId = Annotated[str, Depends(get_patient_id)]


def _row_to_report(r: dict) -> PathologyReport:
    created_at = r["created_at"]
    if not isinstance(created_at, datetime):
        created_at = datetime.fromisoformat(str(created_at))
    raw_q = r.get("questions") or "[]"
    try:
        questions = json.loads(raw_q) if isinstance(raw_q, str) else list(raw_q)
    except Exception:
        questions = []
    return PathologyReport(
        id=r["id"],
        report_text=r["report_text"],
        explanation=r["explanation"],
        questions=questions,
        created_at=created_at,
    )


@router.post("/translate-report", response_model=TranslateReportOut)
async def translate_report(
    body: TranslateReportIn,
    patient_id: PatientId,
) -> TranslateReportOut:
    system = (
        "You are a compassionate medical translator helping a testicular cancer patient "
        "understand their pathology report. Explain exactly what is written in the report in "
        "plain, clear English — as if explaining to a smart friend with no medical background.\n\n"
        "Rules:\n"
        "- Only explain what is explicitly written in the report. Never add information not present.\n"
        "- Define every medical term the first time it appears.\n"
        "- Be accurate but warm in tone.\n"
        "- After the explanation, generate 4-5 specific questions the patient should ask their "
        "oncologist at their next appointment, based only on what you found in the report.\n"
        'Return JSON: {"explanation": string, "questions": string[]}. No markdown, no preamble.'
    )
    parsed = await anthropic_client.call_claude(
        system=system,
        user=body.reportText,
        feature_tag="pathology",
    )
    explanation = str(parsed.get("explanation") or "")
    questions = [str(q) for q in (parsed.get("questions") or [])]

    report_id = str(uuid.uuid4())
    # Persist so the patient can revisit past reports.
    clickhouse_client.insert_rows(
        "pathology_reports",
        [[report_id, patient_id, body.reportText, explanation, json.dumps(questions)]],
        column_names=["id", "patient_id", "report_text", "explanation", "questions"],
    )

    trial_search_status: str = "skipped"
    ctx = patient_context.load_patient_context(patient_id)
    if ctx.profile:
        run_id = trial_search_store.insert_pending_run(patient_id, report_id)
        # Synchronous: wait for the agentic trial search so the client gets the
        # final state in one round-trip. UI shows a single spinner; no polling.
        await trial_finder.find_trials_for_patient(patient_id, run_id=run_id)
        latest = trial_search_store.latest_run(patient_id)
        latest_status = (latest or {}).get("status", "failed")
        trial_search_status = "completed" if latest_status == "completed" else "failed"

    return TranslateReportOut(
        explanation=explanation,
        questions=questions,
        trial_search_status=trial_search_status,  # type: ignore[arg-type]
    )


@router.get("/pathology-reports", response_model=PathologyReportList)
def list_reports(patient_id: PatientId) -> PathologyReportList:
    """Return all past reports for this patient, newest first."""
    rows = clickhouse_client.query_all(
        """
        SELECT id, report_text, explanation, questions, created_at
        FROM pathology_reports
        WHERE patient_id = {pid:String}
        ORDER BY created_at DESC
        """,
        {"pid": patient_id},
    )
    return PathologyReportList(reports=[_row_to_report(r) for r in rows])


@router.get("/pathology-reports/latest", response_model=PathologyReport)
def latest_report(patient_id: PatientId) -> PathologyReport:
    """Most recent report — used by the Trials page to pre-fill context."""
    row = clickhouse_client.query_one(
        """
        SELECT id, report_text, explanation, questions, created_at
        FROM pathology_reports
        WHERE patient_id = {pid:String}
        ORDER BY created_at DESC
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail={"message": "No pathology reports found"})
    return _row_to_report(row)
