"""Trial finder API — latest results and dev trigger."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.agents import trial_finder
from app.deps import get_patient_id
from app.models import FindTrialsLatestOut, FindTrialsOut
from app.services import trial_search_store

router = APIRouter(tags=["trials"])

PatientId = Annotated[str, Depends(get_patient_id)]


@router.get("/find-trials/latest", response_model=FindTrialsLatestOut)
def find_trials_latest(patient_id: PatientId) -> FindTrialsLatestOut:
    row = trial_search_store.latest_run(patient_id)
    if not row:
        return FindTrialsLatestOut(status="pending")
    payload = trial_search_store.row_to_api_payload(row)
    return FindTrialsLatestOut(**payload)


@router.post("/find-trials", response_model=FindTrialsOut)
async def find_trials_post(
    patient_id: PatientId,
    background_tasks: BackgroundTasks,
) -> FindTrialsOut:
    """Dev/curl gate — same background job as translate-report."""
    if not trial_finder.can_start_trial_search(patient_id):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Profile and pathology report required before trial search",
            },
        )
    from app.services.patient_context import load_patient_context, require_pathology

    ctx = load_patient_context(patient_id)
    pathology = require_pathology(ctx)
    run_id = trial_search_store.insert_pending_run(patient_id, str(pathology["id"]))
    background_tasks.add_task(trial_finder.find_trials_for_patient, patient_id, run_id=run_id)
    return FindTrialsOut(
        status="pending",
        message="Trial search started",
        run_id=run_id,
    )
