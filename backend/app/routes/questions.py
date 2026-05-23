"""Doctor-questions prep sheet endpoints."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.clients import anthropic_client, clickhouse_client
from app.deps import get_patient_id
from app.models import (
    DoctorQuestion,
    DoctorQuestionIn,
    DoctorQuestionsOut,
    OkResponse,
    SummariseOut,
    SummariseTheme,
)

router = APIRouter(tags=["questions"])

PatientId = Annotated[str, Depends(get_patient_id)]


def _existing_texts(patient_id: str, source: str) -> set[str]:
    rows = clickhouse_client.query_all(
        """
        SELECT text FROM doctor_questions FINAL
        WHERE patient_id = {pid:String} AND source = {src:String}
        """,
        {"pid": patient_id, "src": source},
    )
    return {r["text"] for r in rows}


def _insert_question(patient_id: str, source: str, text: str) -> None:
    clickhouse_client.insert_rows(
        "doctor_questions",
        [[str(uuid.uuid4()), patient_id, source, text, 0]],
        column_names=["id", "patient_id", "source", "text", "done"],
    )


@router.post("/doctor-questions", response_model=OkResponse)
def add_questions(body: DoctorQuestionIn, patient_id: PatientId) -> OkResponse:
    texts: list[str] = []
    if body.items:
        texts.extend(t.strip() for t in body.items if t and t.strip())
    if body.text and body.text.strip():
        texts.append(body.text.strip())
    if not texts:
        return OkResponse(ok=True)

    existing = _existing_texts(patient_id, body.source)
    for text in texts:
        if text in existing:
            continue
        _insert_question(patient_id, body.source, text)
        existing.add(text)
    return OkResponse(ok=True)


@router.get("/doctor-questions", response_model=DoctorQuestionsOut)
def list_questions(patient_id: PatientId) -> DoctorQuestionsOut:
    rows = clickhouse_client.query_all(
        """
        SELECT id, source, text, added_at, done
        FROM doctor_questions FINAL
        WHERE patient_id = {pid:String}
        ORDER BY added_at DESC
        """,
        {"pid": patient_id},
    )
    items = [
        DoctorQuestion(
            id=r["id"],
            source=r["source"],
            text=r["text"],
            added_at=r["added_at"] if isinstance(r["added_at"], datetime)
            else datetime.fromisoformat(str(r["added_at"])),
            done=bool(r["done"]),
        )
        for r in rows
    ]
    return DoctorQuestionsOut(items=items)


@router.post("/doctor-questions/{question_id}/done", response_model=OkResponse)
def mark_done(question_id: str, patient_id: PatientId) -> OkResponse:
    row = clickhouse_client.query_one(
        """
        SELECT id, source, text, added_at, done
        FROM doctor_questions FINAL
        WHERE patient_id = {pid:String} AND id = {qid:String}
        LIMIT 1
        """,
        {"pid": patient_id, "qid": question_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail={"message": "Question not found"})
    new_done = 0 if bool(row["done"]) else 1
    # ReplacingMergeTree ORDER BY (patient_id, added_at, id) — re-insert same key with new done.
    added_at = row["added_at"]
    if not isinstance(added_at, datetime):
        added_at = datetime.fromisoformat(str(added_at))
    clickhouse_client.insert_rows(
        "doctor_questions",
        [[row["id"], patient_id, row["source"], row["text"], added_at, new_done]],
        column_names=["id", "patient_id", "source", "text", "added_at", "done"],
    )
    return OkResponse(ok=True)


@router.post("/doctor-questions/summarise", response_model=SummariseOut)
async def summarise_questions(patient_id: PatientId) -> SummariseOut:
    rows = clickhouse_client.query_all(
        """
        SELECT source, text
        FROM doctor_questions FINAL
        WHERE patient_id = {pid:String} AND done = 0
        ORDER BY added_at ASC
        """,
        {"pid": patient_id},
    )
    if not rows:
        return SummariseOut(themes=[])

    payload = [{"source": r["source"], "text": r["text"]} for r in rows]
    system = (
        "You are preparing a patient's appointment prep sheet from a mixed list of questions "
        "they have collected (from pathology reports, symptom trends, and their own notes).\n\n"
        "Deduplicate near-identical questions, group related ones under short themed headings, "
        "and order by likely importance for the next oncology visit. Keep every distinct "
        "concern — do not drop questions.\n\n"
        'Return JSON: {"themes": [{"heading": string, "questions": string[]}]}. '
        "No markdown, no preamble."
    )
    parsed = await anthropic_client.call_claude(
        system=system,
        user=json.dumps(payload),
        feature_tag="doctor-questions",
    )
    themes_raw = parsed.get("themes") or []
    themes: list[SummariseTheme] = []
    for t in themes_raw:
        if not isinstance(t, dict):
            continue
        themes.append(
            SummariseTheme(
                heading=str(t.get("heading") or "Questions"),
                questions=[str(q) for q in (t.get("questions") or [])],
            )
        )
    return SummariseOut(themes=themes)
