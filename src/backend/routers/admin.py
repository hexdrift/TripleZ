"""Admin endpoints for bulk loading and upserting data."""

from __future__ import annotations

import base64
import io
import json

import pandas as pd
import requests
from fastapi import APIRouter, HTTPException, UploadFile, File

from config import model_to_dict
from src.backend.dependencies import bump_version, core
from src.backend.schemas import (
    PersonnelLoadRequest,
    RoomsLoadRequest,
    RoomsUpsertRequest,
    SetRoomDepartmentRequest,
    SimpleOK,
)
from src.backend.settings import load_settings


def _build_unknown_personnel_excel(unknown_personnel: list[dict]) -> str:
    """Build an Excel file from unknown personnel and return as base64 string."""
    df = pd.DataFrame(unknown_personnel)
    df = df.rename(columns={
        "person_id": "מזהה",
        "building_name": "מבנה",
        "room_number": "חדר",
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _validate_occupant_ids(df: pd.DataFrame) -> list[dict]:
    """Validate occupant_ids against known personnel, removing unknown ones in-place.

    Returns list of unknown personnel dicts.
    """
    known_ids = core.get_known_personnel_ids()
    unknown_personnel: list[dict] = []

    if not known_ids or "occupant_ids" not in df.columns:
        return unknown_personnel

    for idx, row in df.iterrows():
        ids = row["occupant_ids"]
        if not ids:
            continue
        valid_ids = []
        for pid in ids:
            pid_str = str(pid).strip()
            if pid_str in known_ids:
                valid_ids.append(pid_str)
            else:
                unknown_personnel.append({
                    "person_id": pid_str,
                    "building_name": str(row.get("building_name", "")),
                    "room_number": str(row.get("room_number", "")),
                })
        df.at[idx, "occupant_ids"] = valid_ids

    return unknown_personnel


def _build_warnings(unknown_personnel: list[dict]) -> dict:
    """Build the warnings dict for unknown personnel, or empty dict."""
    if not unknown_personnel:
        return {}
    return {
        "warnings": {
            "unknown_personnel": unknown_personnel,
            "message": f"{len(unknown_personnel)} אנשים לא נמצאו ברשימת כוח האדם ולא שובצו",
            "excel_base64": _build_unknown_personnel_excel(unknown_personnel),
        }
    }

router = APIRouter(prefix="/admin")


@router.post("/load_rooms")
def admin_load_rooms(req: RoomsLoadRequest) -> dict:
    """Replace all rooms with the provided list.

    Args:
        req: Request containing the full list of rooms to load.

    Returns:
        Dict with ok status and any warnings about unknown personnel.
    """
    try:
        df = pd.DataFrame([model_to_dict(r) for r in req.rooms])
        unknown = _validate_occupant_ids(df)
        core.load_rooms(df)
        bump_version()
        return {"ok": True, **_build_warnings(unknown)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upsert_rooms")
def admin_upsert_rooms(req: RoomsUpsertRequest) -> dict:
    """Update existing rooms or insert new ones.

    Args:
        req: Request containing rooms to upsert (only set fields are applied).

    Returns:
        Dict with counts of updated, added, and total rooms.
    """
    try:
        df = pd.DataFrame([model_to_dict(r, exclude_unset=True) for r in req.rooms])
        if df.empty:
            return {"updated": 0, "added": 0, "total_rooms": len(core.rooms_with_state())}
        result = core.upsert_rooms(df)
        bump_version()
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/load_personnel", response_model=SimpleOK)
def admin_load_personnel(req: PersonnelLoadRequest) -> SimpleOK:
    """Replace all personnel with the provided list.

    Args:
        req: Request containing the full list of personnel to load.

    Returns:
        SimpleOK confirming the operation succeeded.
    """
    try:
        df = pd.DataFrame([model_to_dict(p) for p in req.personnel])
        core.load_personnel(df)
        bump_version()
        return SimpleOK(ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload_rooms")
async def upload_rooms_file(file: UploadFile = File(...)) -> dict:
    """Upload an Excel file to load rooms.

    Args:
        file: Excel file with columns: building_name, room_number, number_of_beds,
              room_rank, gender, occupant_ids (JSON array string).

    Returns:
        Dict with ok status, count, and any warnings about unknown personnel.
    """
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        if "occupant_ids" in df.columns:
            df["occupant_ids"] = df["occupant_ids"].apply(
                lambda v: json.loads(v) if isinstance(v, str) and v.strip().startswith("[") else []
            )
        else:
            df["occupant_ids"] = [[] for _ in range(len(df))]

        unknown = _validate_occupant_ids(df)
        core.load_rooms(df)
        bump_version()
        return {"ok": True, "count": len(df), **_build_warnings(unknown)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/set_room_department", response_model=SimpleOK)
def set_room_department(req: SetRoomDepartmentRequest) -> SimpleOK:
    """Set or clear a room's designated department (admin only).

    Args:
        req: Request with building_name, room_number, and optional department.

    Returns:
        SimpleOK indicating success or failure.
    """
    ok, err = core.set_room_department(req.building_name, req.room_number, req.department)
    if ok:
        bump_version()
    return SimpleOK(ok=ok, detail=err)


@router.post("/load_personnel_from_url")
def load_personnel_from_url() -> dict:
    """Load personnel from the configured URL in settings.

    Returns:
        Dict with ok status and count of loaded personnel.
    """
    settings = load_settings()
    url = settings.get("personnel_url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="כתובת URL לכוח אדם לא הוגדרה בהגדרות")
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        content = resp.content
        if url.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
        core.load_personnel(df)
        bump_version()
        return {"ok": True, "count": len(df)}
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"שגיאה בטעינה מ-URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload_personnel")
async def upload_personnel_file(file: UploadFile = File(...)) -> dict:
    """Upload an Excel file to load personnel.

    Args:
        file: Excel file with columns: person_id, full_name, department, gender, rank.

    Returns:
        Dict with ok status and count of loaded personnel.
    """
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        core.load_personnel(df)
        bump_version()
        return {"ok": True, "count": len(df)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
