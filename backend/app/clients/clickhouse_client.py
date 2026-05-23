"""ClickHouse Cloud wrapper."""

from __future__ import annotations

import os
import threading
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

