"""Patient profile endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.clients import clickhouse_client
from app.deps import get_patient_id
from app.models import Profile, ProfileIn

router = APIRouter(tags=["profile"])

PatientId = Annotated[str, Depends(get_patient_id)]


@router.post("/profile", response_model=Profile)
def upsert_profile(body: ProfileIn, patient_id: PatientId) -> Profile:
    clickhouse_client.insert_rows(
        "patient_profiles",
        [[patient_id, body.name or "", body.age or 0, body.cancer_type, body.stage, body.location]],
        column_names=["patient_id", "name", "age", "cancer_type", "stage", "location"],
    )
    row = clickhouse_client.query_one(
        """
        SELECT patient_id, created_at, name, age, cancer_type, stage, location
        FROM patient_profiles FINAL
        WHERE patient_id = {pid:String}
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    if not row:
        raise HTTPException(status_code=500, detail={"message": "Profile write did not persist"})
    return _profile_from_row(row)


@router.get("/profile", response_model=Profile)
def get_profile(patient_id: PatientId) -> Profile:
    row = clickhouse_client.query_one(
        """
        SELECT patient_id, created_at, name, age, cancer_type, stage, location
        FROM patient_profiles FINAL
        WHERE patient_id = {pid:String}
        LIMIT 1
        """,
        {"pid": patient_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail={"message": "Profile not found"})
    return _profile_from_row(row)


def _profile_from_row(row: dict) -> Profile:
    created_at = row["created_at"]
    if not isinstance(created_at, datetime):
        created_at = datetime.fromisoformat(str(created_at))
    raw_age = row.get("age") or 0
    return Profile(
        patient_id=row["patient_id"],
        name=row["name"] or None,
        age=int(raw_age) if raw_age else None,
        cancer_type=row["cancer_type"],
        stage=row["stage"],
        location=row["location"],
        created_at=created_at,
    )
