"""Load aggregated patient context from ClickHouse for the trial finder agent."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.clients import clickhouse_client


@dataclass
class PatientContext:
    patient_id: str
    profile: dict[str, Any] | None
    pathology: dict[str, Any] | None
    symptom_rows: list[dict[str, Any]]
    symptom_summary: dict[str, Any] | None

    def to_json(self) -> dict[str, Any]:
        return {
            "patient_id": self.patient_id,
            "profile": self.profile,
            "pathology": self.pathology,
            "symptom_trends": self.symptom_rows,
            "symptom_summary": self.symptom_summary,
        }


def _parse_pathology_questions(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(q) for q in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(q) for q in parsed]
        except json.JSONDecodeError:
            pass
    return []


def load_patient_context(patient_id: str) -> PatientContext:
    profile_row = clickhouse_client.query_one(
        """
        SELECT patient_id, name, age, cancer_type, stage, location, created_at
        FROM patient_profiles FINAL
        WHERE patient_id = {pid:String}
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    profile: dict[str, Any] | None = None
    if profile_row:
        created_at = profile_row["created_at"]
        if not isinstance(created_at, datetime):
            created_at = datetime.fromisoformat(str(created_at))
        profile = {
            "patient_id": profile_row["patient_id"],
            "name": profile_row.get("name") or None,
            "age": int(profile_row["age"]) if profile_row.get("age") else None,
            "cancer_type": profile_row["cancer_type"],
            "stage": profile_row["stage"],
            "location": profile_row["location"],
            "created_at": created_at.isoformat(),
        }

    pathology_row = clickhouse_client.query_one(
        """
        SELECT id, report_text, explanation, questions, created_at
        FROM pathology_reports
        WHERE patient_id = {pid:String}
        ORDER BY created_at DESC
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    pathology: dict[str, Any] | None = None
    if pathology_row:
        created_at = pathology_row["created_at"]
        if not isinstance(created_at, datetime):
            created_at = datetime.fromisoformat(str(created_at))
        pathology = {
            "id": pathology_row["id"],
            "report_text": pathology_row["report_text"],
            "explanation": pathology_row["explanation"],
            "questions": _parse_pathology_questions(pathology_row.get("questions")),
            "created_at": created_at.isoformat(),
        }

    symptom_rows = clickhouse_client.query_all(
        """
        SELECT toDate(logged_at) AS day, symptom_name, round(avg(score), 2) AS score
        FROM symptom_logs
        WHERE patient_id = {pid:String}
          AND logged_at >= now() - INTERVAL 14 DAY
        GROUP BY day, symptom_name
        ORDER BY day ASC, symptom_name ASC
        """,
        {"pid": patient_id},
    )
    trends: list[dict[str, Any]] = []
    for row in symptom_rows:
        trends.append(
            {
                "day": str(row["day"]),
                "symptom": row["symptom_name"],
                "score": float(row["score"]),
            }
        )

    return PatientContext(
        patient_id=patient_id,
        profile=profile,
        pathology=pathology,
        symptom_rows=trends,
        symptom_summary=None,
    )


def require_pathology(context: PatientContext) -> dict[str, Any]:
    if not context.pathology:
        raise ValueError("No pathology report found for this patient")
    return context.pathology
