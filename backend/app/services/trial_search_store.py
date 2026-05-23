"""Persist and read trial search runs from ClickHouse.

The ClickHouse column ``nimble_params_used`` is reused to hold the new
``search_query_used`` JSON blob (cancer_type, location, page_size,
must_match_terms). Keeping the column name avoids a migration; the API and
agent code only reference ``search_query_used``.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Literal

from app.clients import clickhouse_client

TrialSearchStatus = Literal["pending", "completed", "failed"]


_COLUMNS = [
    "run_id",
    "patient_id",
    "pathology_report_id",
    "status",
    "nimble_params_used",
    "planning_rationale",
    "trials_json",
    "appointment_summary",
    "questions_json",
    "themes_json",
    "note",
    "source",
    "created_at",
    "updated_at",
]


def _now() -> datetime:
    return datetime.utcnow()


def insert_pending_run(
    patient_id: str,
    pathology_report_id: str,
) -> str:
    run_id = str(uuid.uuid4())
    clickhouse_client.insert_rows(
        "trial_search_runs",
        [
            [
                run_id,
                patient_id,
                pathology_report_id,
                "pending",
                "{}",
                "",
                "[]",
                "",
                "[]",
                "[]",
                "",
                "live",
                _now(),
                _now(),
            ]
        ],
        column_names=_COLUMNS,
    )
    return run_id


def complete_run(
    run_id: str,
    patient_id: str,
    pathology_report_id: str,
    *,
    search_query_used: dict[str, Any],
    planning_rationale: str,
    trials: list[dict[str, Any]],
    appointment_summary: str,
    questions: list[str],
    themes: list[dict[str, Any]] | None = None,
    source: str = "live",
) -> None:
    clickhouse_client.insert_rows(
        "trial_search_runs",
        [
            [
                run_id,
                patient_id,
                pathology_report_id,
                "completed",
                json.dumps(search_query_used),
                planning_rationale,
                json.dumps(trials),
                appointment_summary,
                json.dumps(questions),
                json.dumps(themes or []),
                "",
                source,
                _now(),
                _now(),
            ]
        ],
        column_names=_COLUMNS,
    )


def fail_run(
    run_id: str,
    patient_id: str,
    note: str,
    *,
    pathology_report_id: str = "",
) -> None:
    clickhouse_client.insert_rows(
        "trial_search_runs",
        [
            [
                run_id,
                patient_id,
                pathology_report_id,
                "failed",
                "{}",
                "",
                "[]",
                "",
                "[]",
                "[]",
                note[:2000],
                "live",
                _now(),
                _now(),
            ]
        ],
        column_names=_COLUMNS,
    )


def latest_run(patient_id: str) -> dict[str, Any] | None:
    row = clickhouse_client.query_one(
        """
        SELECT
          run_id,
          patient_id,
          pathology_report_id,
          status,
          nimble_params_used,
          planning_rationale,
          trials_json,
          appointment_summary,
          questions_json,
          themes_json,
          note,
          source,
          created_at,
          updated_at
        FROM trial_search_runs FINAL
        WHERE patient_id = {pid:String}
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    if not row:
        return None
    return row


def row_to_api_payload(row: dict[str, Any]) -> dict[str, Any]:
    def _loads(raw: Any, default: Any) -> Any:
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return default
        return default

    status = str(row.get("status") or "pending")
    out: dict[str, Any] = {"status": status}
    if status == "completed":
        out["trials"] = _loads(row.get("trials_json"), [])
        out["planning_rationale"] = row.get("planning_rationale") or ""
        out["search_query_used"] = _loads(row.get("nimble_params_used"), {})
        out["appointment_summary"] = row.get("appointment_summary") or ""
        out["questions_to_ask_oncologist"] = _loads(row.get("questions_json"), [])
        themes = _loads(row.get("themes_json"), [])
        if themes:
            out["themes"] = themes
        out["source"] = row.get("source") or "live"
    elif status == "failed":
        out["note"] = row.get("note") or "Trial search failed"
    return out
