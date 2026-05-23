"""Pydantic request/response models for the TC Co-pilot API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Stage = Literal["I", "II", "III"]
QuestionSource = Literal["report", "symptom-alert", "self"]


# ── Profile ───────────────────────────────────────────────────────────────────


class ProfileIn(BaseModel):
    name: str | None = None
    age: int | None = Field(None, ge=1, le=120)
    cancer_type: str = "Testicular Cancer"
    stage: Stage
    location: str


class Profile(BaseModel):
    patient_id: str
    name: str | None = None
    age: int | None = None
    cancer_type: str
    stage: str
    location: str
    created_at: datetime


# ── Symptoms ──────────────────────────────────────────────────────────────────


class Symptom(BaseModel):
    symptom_name: str
    display_name: str
    is_default: bool


class SymptomList(BaseModel):
    symptoms: list[Symptom]


class SymptomScore(BaseModel):
    symptom_name: str
    score: int = Field(ge=1, le=10)


class SymptomLogIn(BaseModel):
    scores: list[SymptomScore]


class SymptomValidateIn(BaseModel):
    symptomText: str


class SymptomValidateOut(BaseModel):
    valid: bool
    symptom_name: str | None = None
    display_name: str | None = None
    message: str


class SymptomSummaryOut(BaseModel):
    summary: str
    alerts: list[str]


class ChartRow(BaseModel):
    day: str
    # Dynamic per-symptom score keys handled via model_extra.
    model_config = {"extra": "allow"}


class ChartResponse(BaseModel):
    rows: list[dict]  # each row: { day: 'YYYY-MM-DD', <symptom_name>: score, ... }


# ── Pathology ─────────────────────────────────────────────────────────────────


class TranslateReportIn(BaseModel):
    reportText: str


class TranslateReportOut(BaseModel):
    explanation: str
    questions: list[str]


# ── Pathology reports ─────────────────────────────────────────────────────────


class PathologyReport(BaseModel):
    id: str
    report_text: str
    explanation: str
    questions: list[str]
    created_at: datetime


class PathologyReportList(BaseModel):
    reports: list[PathologyReport]


# ── Doctor questions ──────────────────────────────────────────────────────────


class DoctorQuestion(BaseModel):
    id: str
    source: QuestionSource
    text: str
    added_at: datetime
    done: bool


class DoctorQuestionsOut(BaseModel):
    items: list[DoctorQuestion]


class DoctorQuestionIn(BaseModel):
    source: QuestionSource
    # Accept either a single text or a list of items.
    text: str | None = None
    items: list[str] | None = None


class SummariseTheme(BaseModel):
    heading: str
    questions: list[str]


class SummariseOut(BaseModel):
    themes: list[SummariseTheme]


class OkResponse(BaseModel):
    ok: bool = True


# ── Analytics ─────────────────────────────────────────────────────────────────


class AnalyticsOverview(BaseModel):
    patients: int
    symptom_logs: int
    medications: int
    query_ms: float


class MedicationImpactRow(BaseModel):
    medication: str
    symptom: str
    avg_before: float
    avg_after: float
    delta: float
    n_before: int
    n_after: int


class MedicationImpactResponse(BaseModel):
    rows: list[MedicationImpactRow]
    query_ms: float


class SymptomTrendPoint(BaseModel):
    day: str
    symptom_name: str
    avg_score: float
    n: int


class SymptomTrendsResponse(BaseModel):
    rows: list[SymptomTrendPoint]
    query_ms: float
