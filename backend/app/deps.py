from typing import Annotated

from fastapi import Header, HTTPException


def get_patient_id(
    x_patient_id: Annotated[str | None, Header(alias="X-Patient-Id")] = None,
) -> str:
    if not x_patient_id or not x_patient_id.strip():
        raise HTTPException(
            status_code=400,
            detail={"message": "Missing X-Patient-Id header"},
        )
    return x_patient_id.strip()
