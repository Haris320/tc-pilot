"""ClickHouse Cloud wrapper."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver import Client

from app.config import require_env

_client: Client | None = None
_client_lock = threading.Lock()

TABLE_NAMES = (
    "patient_profiles",
    "patient_symptoms",
    "symptom_logs",
    "doctor_questions",
    "pathology_reports",
    "patient_medications",
    "trial_search_runs",
)

SETUP_STATEMENTS: dict[str, str] = {
    "patient_profiles": """
        CREATE TABLE IF NOT EXISTS patient_profiles (
          patient_id    String,
          created_at    DateTime DEFAULT now(),
          name          String DEFAULT '',
          cancer_type   String,
          stage         String,
          location      String,
          age           UInt8 DEFAULT 0
        ) ENGINE = ReplacingMergeTree() ORDER BY patient_id
    """,
    "patient_symptoms": """
        CREATE TABLE IF NOT EXISTS patient_symptoms (
          patient_id      String,
          symptom_name    String,
          display_name    String,
          added_at        DateTime DEFAULT now(),
          is_default      UInt8
        ) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, symptom_name)
    """,
    "symptom_logs": """
        CREATE TABLE IF NOT EXISTS symptom_logs (
          patient_id      String,
          logged_at       DateTime DEFAULT now(),
          symptom_name    String,
          score           UInt8
        ) ENGINE = MergeTree() ORDER BY (patient_id, logged_at, symptom_name)
    """,
    "doctor_questions": """
        CREATE TABLE IF NOT EXISTS doctor_questions (
          id          String,
          patient_id  String,
          source      String,
          text        String,
          added_at    DateTime DEFAULT now(),
          done        UInt8 DEFAULT 0
        ) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, added_at, id)
    """,
    "pathology_reports": """
        CREATE TABLE IF NOT EXISTS pathology_reports (
          id           String,
          patient_id   String,
          report_text  String,
          explanation  String,
          questions    String,
          created_at   DateTime DEFAULT now()
        ) ENGINE = MergeTree() ORDER BY (patient_id, created_at, id)
    """,
    "patient_medications": """
        CREATE TABLE IF NOT EXISTS patient_medications (
          patient_id      String,
          medication_name String,
          display_name    String,
          start_date      Date,
          added_at        DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, medication_name)
    """,
    "trial_search_runs": """
        CREATE TABLE IF NOT EXISTS trial_search_runs (
          run_id                    String,
          patient_id                String,
          pathology_report_id       String,
          status                    String,
          nimble_params_used        String DEFAULT '{}',
          planning_rationale        String DEFAULT '',
          trials_json               String DEFAULT '[]',
          appointment_summary       String DEFAULT '',
          questions_json            String DEFAULT '[]',
          themes_json               String DEFAULT '[]',
          note                      String DEFAULT '',
          source                    String DEFAULT 'live',
          created_at                DateTime DEFAULT now(),
          updated_at                DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, run_id)
    """,
}


def get_client() -> Client:
    global _client
    if _client is None:
        host = require_env("CLICKHOUSE_HOST")
        _client = clickhouse_connect.get_client(
            host=host,
            username=os.getenv("CLICKHOUSE_USER", "default"),
            password=require_env("CLICKHOUSE_PASSWORD"),
            database=os.getenv("CLICKHOUSE_DATABASE", "tc_copilot"),
            secure=True,
        )
    return _client


def ensure_database() -> str:
    database = os.getenv("CLICKHOUSE_DATABASE", "tc_copilot")
    # Connect without a database so we can create it if missing.
    bootstrap = clickhouse_connect.get_client(
        host=require_env("CLICKHOUSE_HOST"),
        username=os.getenv("CLICKHOUSE_USER", "default"),
        password=require_env("CLICKHOUSE_PASSWORD"),
        secure=True,
    )
    bootstrap.command(f"CREATE DATABASE IF NOT EXISTS {database}")
    return database


def setup_tables() -> list[str]:
    ensure_database()
    client = get_client()
    for ddl in SETUP_STATEMENTS.values():
        client.command(ddl)
    # Backfill columns added after initial deploy — idempotent.
    client.command(
        "ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS name String DEFAULT ''"
    )
    client.command(
        "ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS age UInt8 DEFAULT 0"
    )
    return list(TABLE_NAMES)


def health_check_write_read() -> dict[str, Any]:
    import time

    patient_id = f"health-check-{int(time.time())}"
    client = get_client()
    client.insert(
        "patient_profiles",
        [[patient_id, "Testicular Cancer", "I", "health-check-city"]],
        column_names=["patient_id", "cancer_type", "stage", "location"],
    )
    result = client.query(
        """
        SELECT patient_id, created_at, cancer_type, stage, location
        FROM patient_profiles
        WHERE patient_id = {patient_id:String}
        ORDER BY created_at DESC
        LIMIT 1
        """,
        parameters={"patient_id": patient_id},
    )
    rows = list(result.named_results())
    read_ok = len(rows) == 1 and rows[0]["patient_id"] == patient_id
    row: dict[str, Any] | None = None
    if read_ok:
        raw = rows[0]
        created_at = raw["created_at"]
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        row = {
            "patient_id": raw["patient_id"],
            "created_at": created_at,
            "cancer_type": raw["cancer_type"],
            "stage": raw["stage"],
            "location": raw["location"],
        }
    return {"writeOk": True, "readOk": read_ok, "row": row}


def ping() -> bool:
    """Lightweight read for Datadog health trace."""
    client = get_client()
    client.query("SELECT 1")
    return True


# ── Generic helpers used by feature routes ────────────────────────────────────


def insert_rows(table: str, rows: list[list[Any]], column_names: list[str]) -> None:
    client = get_client()
    with _client_lock:
        client.insert(table, rows, column_names=column_names)


def query_all(sql: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    client = get_client()
    with _client_lock:
        result = client.query(sql, parameters=parameters or {})
        return list(result.named_results())


def query_one(sql: str, parameters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rows = query_all(sql, parameters)
    return rows[0] if rows else None


# ── Population-level analytics ────────────────────────────────────────────────


def analytics_overview() -> dict[str, Any]:
    """Count rows across the three main tables; return with query_ms."""
    client = get_client()
    t0 = time.perf_counter()
    with _client_lock:
        result = client.query(
            """
            SELECT
              (SELECT count() FROM patient_profiles)   AS patients,
              (SELECT count() FROM symptom_logs)        AS symptom_logs,
              (SELECT count() FROM patient_medications) AS medications
            """
        )
    query_ms = round((time.perf_counter() - t0) * 1000, 1)
    row = list(result.named_results())[0]
    return {
        "patients": int(row["patients"]),
        "symptom_logs": int(row["symptom_logs"]),
        "medications": int(row["medications"]),
        "query_ms": query_ms,
    }


def medication_impact() -> dict[str, Any]:
    """
    For each (medication, symptom) pair, compute avg score in the 14 days
    before vs 14 days after the patient started that medication — across
    the whole cohort. Returns rows sorted by improvement (before - after DESC).
    """
    client = get_client()
    t0 = time.perf_counter()
    with _client_lock:
        result = client.query(
            """
            SELECT
              pm.display_name                                            AS medication,
              sl.symptom_name                                            AS symptom,
              round(avgIf(sl.score, sl.logged_at <  toDateTime(pm.start_date)), 2) AS avg_before,
              round(avgIf(sl.score, sl.logged_at >= toDateTime(pm.start_date)), 2) AS avg_after,
              countIf(sl.logged_at <  toDateTime(pm.start_date))        AS n_before,
              countIf(sl.logged_at >= toDateTime(pm.start_date))        AS n_after
            FROM symptom_logs AS sl
            INNER JOIN patient_medications AS pm USING (patient_id)
            WHERE sl.logged_at BETWEEN toDateTime(pm.start_date) - INTERVAL 14 DAY
                                   AND toDateTime(pm.start_date) + INTERVAL 14 DAY
            GROUP BY medication, symptom
            HAVING n_before >= 5 AND n_after >= 5
            ORDER BY (avg_before - avg_after) DESC
            """
        )
    query_ms = round((time.perf_counter() - t0) * 1000, 1)
    rows = []
    for r in result.named_results():
        rows.append({
            "medication": r["medication"],
            "symptom": r["symptom"],
            "avg_before": float(r["avg_before"]),
            "avg_after": float(r["avg_after"]),
            "delta": round(float(r["avg_before"]) - float(r["avg_after"]), 2),
            "n_before": int(r["n_before"]),
            "n_after": int(r["n_after"]),
        })
    return {"rows": rows, "query_ms": query_ms}


def symptom_trends_population(days: int = 90) -> dict[str, Any]:
    """
    Average symptom score per day per symptom across all patients,
    for the last `days` days.
    """
    client = get_client()
    t0 = time.perf_counter()
    with _client_lock:
        result = client.query(
            f"""
            SELECT
              toDate(logged_at)    AS day,
              symptom_name,
              round(avg(score), 2) AS avg_score,
              count()              AS n
            FROM symptom_logs
            WHERE logged_at >= now() - INTERVAL {days} DAY
            GROUP BY day, symptom_name
            ORDER BY day ASC, symptom_name ASC
            """
        )
    query_ms = round((time.perf_counter() - t0) * 1000, 1)
    rows = []
    for r in result.named_results():
        day = r["day"]
        if hasattr(day, "isoformat"):
            day = day.isoformat()
        rows.append({
            "day": str(day),
            "symptom_name": r["symptom_name"],
            "avg_score": float(r["avg_score"]),
            "n": int(r["n"]),
        })
    return {"rows": rows, "query_ms": query_ms}

