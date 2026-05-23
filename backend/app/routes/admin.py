"""Admin endpoints: mock cohort seeding and cleanup."""

from __future__ import annotations

import math
import random
import time
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query

from app.clients import clickhouse_client

router = APIRouter(prefix="/admin", tags=["admin"])

# ── Static mock data pools ────────────────────────────────────────────────────

FIRST_NAMES = [
    "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph",
    "Thomas", "Charles", "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven",
    "Andrew", "Paul", "Joshua", "Kevin", "Brian", "George", "Edward", "Ronald",
    "Timothy", "Jason", "Jeffrey", "Ryan", "Gary", "Jacob",
]

CITIES = [
    "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia",
    "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville",
    "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco",
    "Seattle", "Denver", "Nashville", "Oklahoma City", "El Paso", "Washington",
    "Las Vegas", "Louisville", "Memphis", "Portland", "Baltimore", "Milwaukee",
    "Albuquerque",
]

CANCER_TYPES = ["seminoma", "non-seminoma"]
STAGES = ["I", "II", "III"]

DEFAULT_SYMPTOMS = [
    ("fatigue", "Fatigue"),
    ("nausea", "Nausea"),
    ("neuropathy", "Neuropathy"),
    ("pain", "Pain"),
]

EXTRA_SYMPTOMS = [
    ("tinnitus", "Ear Ringing (Tinnitus)"),
    ("appetite-loss", "Appetite Loss"),
    ("cognitive-fog", "Cognitive Fog"),
]

MEDICATIONS = [
    ("ondansetron", "Ondansetron (Zofran)"),
    ("gabapentin", "Gabapentin"),
    ("modafinil", "Modafinil"),
    ("sertraline", "Sertraline"),
    ("dexamethasone", "Dexamethasone"),
]

# Med → (affected symptom slug, score delta after start — negative means improvement)
MED_EFFECTS: dict[str, list[tuple[str, float]]] = {
    "ondansetron":   [("nausea", -3.0)],
    "gabapentin":    [("neuropathy", -2.0), ("pain", -1.0)],
    "modafinil":     [("fatigue", -2.0)],
    "sertraline":    [("fatigue", -0.5), ("nausea", -0.5), ("cognitive-fog", -0.8)],
    "dexamethasone": [("fatigue", +1.0), ("nausea", -0.5)],
}


def _chemo_ramp(day_idx: int, total_days: int = 90) -> float:
    """
    Simulates two BEP chemotherapy cycles over `total_days`.
    Score oscillates: rises into each cycle, drops between cycles.
    Returns a baseline offset in roughly [-0.5, +2.5].
    """
    t = day_idx / total_days
    return 1.5 * math.sin(math.pi * t * 2) + 0.8 * math.sin(math.pi * t * 4)


def _generate_score(
    base: float,
    day_idx: int,
    med_delta: float,
    after_start: bool,
) -> int:
    ramp = _chemo_ramp(day_idx)
    delta = med_delta if after_start else 0.0
    raw = base + ramp + delta + random.uniform(-1.0, 1.0)
    return max(1, min(10, round(raw)))


# ── Seed endpoint ─────────────────────────────────────────────────────────────


@router.post("/seed-mock-cohort")
def seed_mock_cohort(count: int = Query(default=1000, ge=10, le=10000)):
    """
    Generates `count` synthetic patients with 90 days of symptom logs and
    1-2 medications each. Medication effects are baked into the scores so the
    analytics dashboard shows real signal. All patient_ids are prefixed 'mock-'
    for easy cleanup.
    """
    t_start = time.perf_counter()
    rng = random.Random(42)  # deterministic — same seed → same data every run

    today = date.today()
    window_start = today - timedelta(days=89)

    profile_rows: list[list] = []
    symptom_rows: list[list] = []
    med_rows: list[list] = []
    log_rows: list[list] = []

    for i in range(count):
        pid = f"mock-{uuid.uuid4().hex[:16]}"
        name = rng.choice(FIRST_NAMES)
        cancer_type = rng.choice(CANCER_TYPES)
        stage = rng.choice(STAGES)
        location = rng.choice(CITIES)
        age = rng.randint(18, 55)

        profile_rows.append([pid, name, cancer_type, stage, location, age])

        # Symptoms: 4 defaults + maybe 1 extra
        patient_symptoms = list(DEFAULT_SYMPTOMS)
        if rng.random() < 0.3:
            patient_symptoms.append(rng.choice(EXTRA_SYMPTOMS))

        for slug, display in patient_symptoms:
            symptom_rows.append([pid, slug, display, 1])

        symptom_slugs = [s[0] for s in patient_symptoms]

        # Medications: 1 or 2, starting 20-60 days in
        n_meds = rng.choice([1, 1, 2])
        chosen_meds = rng.sample(MEDICATIONS, n_meds)
        patient_med_starts: dict[str, date] = {}

        for med_slug, med_display in chosen_meds:
            days_offset = rng.randint(20, 60)
            start = window_start + timedelta(days=days_offset)
            med_rows.append([pid, med_slug, med_display, start])
            patient_med_starts[med_slug] = start

        # Precompute net delta per symptom (sum across all meds patient takes)
        symptom_delta: dict[str, list[tuple[date, float]]] = {}
        for med_slug, start_d in patient_med_starts.items():
            for sym_slug, delta in MED_EFFECTS.get(med_slug, []):
                if sym_slug not in symptom_delta:
                    symptom_delta[sym_slug] = []
                symptom_delta[sym_slug].append((start_d, delta))

        # Symptom logs: one per symptom per day for 90 days
        base_scores = {slug: float(rng.randint(3, 6)) for slug in symptom_slugs}

        for day_idx in range(90):
            log_date = window_start + timedelta(days=day_idx)
            log_dt = datetime(log_date.year, log_date.month, log_date.day, 12, 0, 0)

            for sym_slug in symptom_slugs:
                base = base_scores[sym_slug]
                net_delta = 0.0
                for start_d, delta in symptom_delta.get(sym_slug, []):
                    if log_date >= start_d:
                        net_delta += delta

                score = _generate_score(
                    base=base,
                    day_idx=day_idx,
                    med_delta=net_delta,
                    after_start=(net_delta != 0.0),
                )
                log_rows.append([pid, log_dt, sym_slug, score])

    # Bulk inserts
    ch = clickhouse_client.get_client()

    ch.insert(
        "patient_profiles",
        profile_rows,
        column_names=["patient_id", "name", "cancer_type", "stage", "location", "age"],
    )
    ch.insert(
        "patient_symptoms",
        symptom_rows,
        column_names=["patient_id", "symptom_name", "display_name", "is_default"],
    )
    ch.insert(
        "patient_medications",
        med_rows,
        column_names=["patient_id", "medication_name", "display_name", "start_date"],
    )
    ch.insert(
        "symptom_logs",
        log_rows,
        column_names=["patient_id", "logged_at", "symptom_name", "score"],
    )

    elapsed_ms = round((time.perf_counter() - t_start) * 1000)
    return {
        "patients": len(profile_rows),
        "medications": len(med_rows),
        "symptom_logs": len(log_rows),
        "elapsed_ms": elapsed_ms,
    }


@router.delete("/mock-cohort")
def delete_mock_cohort():
    """
    Removes all mock-* rows from the four tables. Safe to call between demos.
    Uses lightweight mutations — may take a few seconds to fully propagate
    on ClickHouse Cloud but is non-blocking.
    """
    t0 = time.perf_counter()
    ch = clickhouse_client.get_client()
    for table in ("patient_profiles", "patient_symptoms", "symptom_logs", "patient_medications"):
        ch.command(f"ALTER TABLE {table} DELETE WHERE patient_id LIKE 'mock-%'")
    elapsed_ms = round((time.perf_counter() - t0) * 1000)
    return {"ok": True, "elapsed_ms": elapsed_ms}
