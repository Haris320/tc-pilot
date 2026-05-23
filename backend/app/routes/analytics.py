"""Population-level analytics endpoints backed by ClickHouse."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.clients import clickhouse_client

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def get_overview():
    """
    Return patient, symptom-log, and medication counts with query latency.
    No patient identity required — this is population data.
    """
    return clickhouse_client.analytics_overview()


@router.get("/medication-impact")
def get_medication_impact():
    """
    For each (medication, symptom) pair, return avg score 14 days before vs
    14 days after prescription start across the whole cohort.
    Rows ordered by improvement (biggest drop first).
    """
    return clickhouse_client.medication_impact()


@router.get("/symptom-trends")
def get_symptom_trends(days: int = Query(default=90, ge=7, le=365)):
    """
    Average symptom score per day per symptom across all patients
    for the last `days` days.
    """
    return clickhouse_client.symptom_trends_population(days=days)
