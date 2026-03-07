"""Personnel query endpoints."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from src.backend.access import filter_personnel_for_session
from src.backend.auth_session import AuthSession, require_authenticated
from src.backend.dependencies import store

router = APIRouter()


@router.get("/personnel")
def get_personnel(session: AuthSession = Depends(require_authenticated)) -> List[dict]:
    """Return all personnel records.

    Returns:
        List of personnel dictionaries, or an empty list if none exist.
    """
    rows = store.get_all("personnel")
    rows = rows if isinstance(rows, list) else []
    return filter_personnel_for_session(session, rows)
