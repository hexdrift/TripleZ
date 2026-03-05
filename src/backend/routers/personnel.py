"""Personnel query endpoints."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter

from src.backend.dependencies import store

router = APIRouter()


@router.get("/personnel")
def get_personnel() -> List[dict]:
    """Return all personnel records.

    Returns:
        List of personnel dictionaries, or an empty list if none exist.
    """
    df = store.get_all("personnel")
    return df if isinstance(df, list) else []
