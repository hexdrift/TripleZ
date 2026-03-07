"""Admin endpoints for bulk loading and upserting data."""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from config import (
    model_to_dict,
    normalize_department,
    normalize_gender,
    normalize_name,
    normalize_rank,
)
from src.backend.auth_session import AuthSession, require_admin
from src.backend.dependencies import bump_version, core, get_data_version, store
from src.backend.runtime_meta import (
    append_audit_event,
    get_sync_status,
    list_audit_events,
    update_sync_status,
)
from src.backend.schemas import (
    AutoAssignRequest,
    PersonnelCreate,
    PersonnelLoadRequest,
    RoomsLoadRequest,
    RoomsUpsertRequest,
    SetRoomDepartmentRequest,
    SimpleOK,
)
from src.backend.settings import load_settings, validate_personnel_source_url

logger = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

PERSONNEL_HEADER_ALIASES = {
    "person_id": "person_id",
    "full_name": "full_name",
    "department": "department",
    "gender": "gender",
    "rank": "rank",
    "מזהה": "person_id",
    "שם מלא": "full_name",
    "זירה": "department",
    "מגדר": "gender",
    "דרגה": "rank",
}

PERSONNEL_COL_HEBREW: dict[str, str] = {
    "person_id": "מזהה",
    "full_name": "שם מלא",
    "department": "זירה",
    "gender": "מגדר",
    "rank": "דרגה",
}

ROOM_HEADER_ALIASES = {
    "building_name": "building_name",
    "room_number": "room_number",
    "number_of_beds": "number_of_beds",
    "room_rank": "room_rank",
    "gender": "gender",
    "occupant_ids": "occupant_ids",
    "designated_department": "designated_department",
    "שם מבנה": "building_name",
    "מספר חדר": "room_number",
    "מספר מיטות": "number_of_beds",
    "דרגת חדר": "room_rank",
    "מגדר": "gender",
    "מזהי דיירים": "occupant_ids",
    "זירה ייעודית": "designated_department",
    "זירה ייעודית (אופציונלי)": "designated_department",
}

ROOM_COL_HEBREW: dict[str, str] = {
    "building_name": "שם מבנה",
    "room_number": "מספר חדר",
    "number_of_beds": "מספר מיטות",
    "room_rank": "דרגת חדר",
    "gender": "מגדר",
    "occupant_ids": "מזהי דיירים",
    "designated_department": "זירה ייעודית",
}


def _sanitize_excel_cell(value: object) -> object:
    """Neutralize spreadsheet formula prefixes in exported string cells."""
    if not isinstance(value, str):
        return value
    trimmed = value.lstrip()
    if trimmed and trimmed[0] in {"=", "+", "-", "@"}:
        return f"'{value}"
    return value


def _sanitize_excel_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy safe for spreadsheet export."""
    return df.map(_sanitize_excel_cell)


def _normalize_personnel_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Rename Hebrew personnel headers into the canonical column names."""
    normalized = df.copy()
    normalized.columns = [
        PERSONNEL_HEADER_ALIASES.get(str(column).strip(), str(column).strip())
        for column in normalized.columns
    ]
    return normalized


def _normalize_rooms_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Rename raw room upload headers into the canonical column names."""
    normalized = df.copy()
    normalized.columns = [
        ROOM_HEADER_ALIASES.get(str(column).strip(), str(column).strip())
        for column in normalized.columns
    ]
    return normalized


def _normalize_personnel_records(df: pd.DataFrame) -> list[dict]:
    """Normalize imported personnel rows into canonical records."""
    normalized = _normalize_personnel_dataframe(df)
    required_columns = list(core.REQUIRED_PERSONNEL_COLS)
    missing = [column for column in required_columns if column not in normalized.columns]
    if missing:
        missing_he = [PERSONNEL_COL_HEBREW.get(c, c) for c in missing]
        raise ValueError(f"חסרות עמודות נדרשות בטבלת כוח האדם: {missing_he}")

    records: list[dict] = []
    seen_person_ids: set[str] = set()

    for _, row in normalized.iterrows():
        person_id = str(row["person_id"]).strip()
        if person_id in seen_person_ids:
            raise ValueError(f"מזהה אדם כפול '{person_id}' בנתוני כוח האדם.")
        seen_person_ids.add(person_id)
        records.append({
            "person_id": person_id,
            "full_name": normalize_name(row["full_name"]),
            "department": normalize_department(row["department"]),
            "gender": normalize_gender(row["gender"]),
            "rank": normalize_rank(row["rank"]),
        })

    return records


def _serialize_personnel_rows(rows: list[dict]) -> list[dict]:
    return sorted(
        [
            {
                "person_id": str(row["person_id"]),
                "full_name": str(row["full_name"]),
                "department": str(row["department"]),
                "gender": str(row["gender"]),
                "rank": str(row["rank"]),
            }
            for row in rows
        ],
        key=lambda row: row["person_id"],
    )


def _load_personnel_records(records: list[dict]) -> dict:
    """Persist normalized personnel rows and reconcile room state."""
    personnel_backup = store.get_all("personnel")
    rooms_backup = store.get_all("rooms")

    current_rows = _serialize_personnel_rows(store.get_all("personnel"))
    next_rows = _serialize_personnel_rows(records)
    if current_rows == next_rows:
        return {
            "ok": True,
            "count": len(next_rows),
            "changed": False,
            "room_state_changed": False,
            "integrity_report": {
                "has_changes": False,
                "removed_personnel_count": 0,
                "removed_room_count": 0,
                "cleared_room_designations_count": 0,
                "removed_unknown_occupants_count": 0,
                "removed_incompatible_occupants_count": 0,
                "removed_duplicate_assignments_count": 0,
                "trimmed_over_capacity_count": 0,
                "messages": [],
                "message": "",
            },
        }

    try:
        df = pd.DataFrame(records, columns=list(core.REQUIRED_PERSONNEL_COLS))
        core.load_personnel(df)
        integrity_report = core.reconcile_runtime_state()
        return {
            "ok": True,
            "count": len(df),
            "changed": True,
            "room_state_changed": bool(integrity_report.get("has_changes")),
            "integrity_report": integrity_report,
        }
    except Exception:
        _restore_table("rooms", rooms_backup)
        _restore_table("personnel", personnel_backup)
        raise


def load_personnel_dataframe(df: pd.DataFrame) -> dict:
    """Normalize, validate, and persist a personnel DataFrame."""
    records = _normalize_personnel_records(df)
    return _load_personnel_records(records)


def load_personnel_from_url_source(url: str) -> dict:
    """Fetch personnel from a remote URL and load it into the runtime store."""
    safe_url = validate_personnel_source_url(url)
    if not safe_url:
        raise ValueError("כתובת URL לכוח אדם לא הוגדרה בהגדרות")

    response, final_url = _fetch_personnel_source_response(safe_url)
    response.raise_for_status()
    content = response.content
    parsed_path = urlparse(final_url).path.lower()
    content_type = response.headers.get("content-type", "").lower()
    is_csv = parsed_path.endswith(".csv") or "text/csv" in content_type or "application/csv" in content_type
    if is_csv:
        df = pd.read_csv(io.BytesIO(content))
    else:
        df = pd.read_excel(io.BytesIO(content))
    return load_personnel_dataframe(df)


def _fetch_personnel_source_response(url: str, *, max_redirects: int = 5) -> tuple[requests.Response, str]:
    """Fetch a personnel source while revalidating every redirect target."""
    current_url = validate_personnel_source_url(url)
    session = requests.Session()

    for _ in range(max_redirects + 1):
        response = session.get(current_url, timeout=30, allow_redirects=False)
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("location", "").strip()
            if not location:
                raise ValueError("מקור כוח האדם החזיר הפניה ללא כתובת יעד")
            current_url = validate_personnel_source_url(urljoin(current_url, location))
            continue
        return response, current_url

    raise ValueError("מקור כוח האדם הפנה יותר מדי פעמים")


def _build_unknown_personnel_excel(unknown_personnel: list[dict]) -> str:
    """Build an Excel file from unknown personnel and return as base64 string."""
    df = pd.DataFrame(unknown_personnel)
    df = df.rename(columns={
        "person_id": "מזהה",
        "building_name": "מבנה",
        "room_number": "חדר",
    })
    df = _sanitize_excel_dataframe(df)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _validate_occupant_ids(df: pd.DataFrame) -> list[dict]:
    """Validate occupant_ids against known personnel, removing unknown ones in-place.

    Returns list of unknown personnel dicts.
    """
    known_ids = core.get_known_personnel_ids()
    unknown_personnel: list[dict] = []

    if "occupant_ids" not in df.columns:
        return unknown_personnel

    for idx, row in df.iterrows():
        ids = core._parse_occupant_ids(row["occupant_ids"])
        if not ids:
            df.at[idx, "occupant_ids"] = []
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


def _restore_table(table: str, rows: list[dict[str, object]]) -> None:
    store.delete_all(table)
    for row in rows:
        store.insert(table, row)


def _actor_department(session: AuthSession | None) -> str | None:
    return session.department if session and session.role == "manager" else None


def _assert_expected_version(expected_version: int | None) -> None:
    if expected_version is None:
        return
    current_version = get_data_version()
    if int(expected_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail="הנתונים השתנו בינתיים. יש לרענן את המסך ולנסות שוב.",
        )


def _sync_status_base_update(*, trigger: str) -> dict:
    return {
        "last_attempt_at": datetime.now(timezone.utc).isoformat(),
        "last_trigger": trigger,
    }


def run_personnel_sync_from_configured_source(
    url: str,
    *,
    trigger: str,
    actor_role: str = "system",
    actor_department: str | None = None,
) -> dict:
    safe_url = validate_personnel_source_url(url)
    if not safe_url:
        raise ValueError("כתובת URL לכוח אדם לא הוגדרה בהגדרות")

    update_sync_status(store, **_sync_status_base_update(trigger=trigger))

    try:
        result = load_personnel_from_url_source(safe_url)
    except Exception as exc:
        update_sync_status(
            store,
            **_sync_status_base_update(trigger=trigger),
            last_error=str(exc),
            last_changed=False,
        )
        append_audit_event(
            store,
            actor_role=actor_role,
            actor_department=actor_department,
            action="personnel_sync_failed",
            entity_type="personnel",
            entity_id="source",
            message=f"סנכרון כוח אדם נכשל ({trigger})",
            details={"trigger": trigger, "error": str(exc), "url": safe_url},
        )
        raise

    update_sync_status(
        store,
        **_sync_status_base_update(trigger=trigger),
        last_success_at=datetime.now(timezone.utc).isoformat(),
        last_error="",
        last_count=result["count"],
        last_changed=bool(result["changed"] or result["room_state_changed"]),
    )
    append_audit_event(
        store,
        actor_role=actor_role,
        actor_department=actor_department,
        action="personnel_sync",
        entity_type="personnel",
        entity_id="source",
        message=f"סנכרון כוח אדם הושלם ({trigger})",
        details={
            "trigger": trigger,
            "count": result["count"],
            "changed": result["changed"],
            "room_state_changed": result["room_state_changed"],
            "integrity_report": result["integrity_report"],
        },
    )
    return result

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@router.post("/load_rooms")
def admin_load_rooms(
    req: RoomsLoadRequest,
    session: AuthSession = Depends(require_admin),
) -> dict:
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
        warnings = _build_warnings(unknown)
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="rooms_load",
            entity_type="rooms",
            entity_id="bulk",
            message="נטענה רשימת חדרים מלאה",
            details={"count": len(df), "warnings": warnings.get("warnings", {})},
        )
        return {"ok": True, **warnings}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upsert_rooms")
def admin_upsert_rooms(
    req: RoomsUpsertRequest,
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Update existing rooms or insert new ones.

    Args:
        req: Request containing rooms to upsert (only set fields are applied).

    Returns:
        Dict with counts of updated, added, and total rooms.
    """
    try:
        _assert_expected_version(req.expected_version)
        df = pd.DataFrame([model_to_dict(r, exclude_unset=True) for r in req.rooms])
        if df.empty:
            return {"updated": 0, "added": 0, "total_rooms": len(core.rooms_with_state())}
        result = core.upsert_rooms(df)
        bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="rooms_upsert",
            entity_type="rooms",
            entity_id="bulk",
            message="חדרים עודכנו ידנית",
            details=result,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/load_personnel")
def admin_load_personnel(
    req: PersonnelLoadRequest,
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Replace all personnel with the provided list.

    Args:
        req: Request containing the full list of personnel to load.

    Returns:
        SimpleOK confirming the operation succeeded.
    """
    try:
        df = pd.DataFrame([model_to_dict(p) for p in req.personnel])
        result = load_personnel_dataframe(df)
        if result["changed"] or result["room_state_changed"]:
            bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="personnel_load",
            entity_type="personnel",
            entity_id="bulk",
            message="רשימת כוח האדם הוחלפה ידנית",
            details={
                "count": result["count"],
                "integrity_report": result["integrity_report"],
            },
        )
        return {
            "ok": True,
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/create_personnel", response_model=SimpleOK)
def admin_create_personnel(
    req: PersonnelCreate,
    session: AuthSession = Depends(require_admin),
) -> SimpleOK:
    """Create a single personnel record without replacing existing data."""
    person_id = str(req.person_id).strip()
    if not person_id:
        raise HTTPException(status_code=400, detail="יש להזין מזהה אדם")

    existing = store.get_by_id("personnel", person_id)
    if existing is not None:
        raise HTTPException(status_code=400, detail=f"מזהה {person_id} כבר קיים")

    try:
        row = model_to_dict(req)
        row["person_id"] = person_id
        store.insert("personnel", row)
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="personnel_create",
            entity_type="personnel",
            entity_id=person_id,
            message="נוסף איש כוח אדם ידנית",
            details={"person_id": person_id},
        )
        return SimpleOK(ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload_rooms")
async def upload_rooms_file(
    file: UploadFile = File(...),
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Upload an Excel file to load rooms.

    Args:
        file: Excel file with columns: building_name, room_number, number_of_beds,
              room_rank, gender, occupant_ids, and optional designated_department.

    Returns:
        Dict with ok status, count, and any warnings about unknown personnel.
    """
    try:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="הקובץ גדול מדי. גודל מרבי: 10MB")
        filename = (file.filename or "").lower()
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        df = _normalize_rooms_dataframe(df)
        if "occupant_ids" in df.columns:
            df["occupant_ids"] = df["occupant_ids"].apply(core._parse_occupant_ids)
        else:
            df["occupant_ids"] = [[] for _ in range(len(df))]

        unknown = _validate_occupant_ids(df)
        core.load_rooms(df)
        bump_version()
        warnings = _build_warnings(unknown)
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="rooms_upload",
            entity_type="rooms",
            entity_id=file.filename or "upload",
            message="קובץ חדרים נטען",
            details={"count": len(df), "warnings": warnings.get("warnings", {})},
        )
        return {"ok": True, "count": len(df), **warnings}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/set_room_department", response_model=SimpleOK)
def set_room_department(
    req: SetRoomDepartmentRequest,
    session: AuthSession = Depends(require_admin),
) -> SimpleOK:
    """Set or clear a room's designated department (admin only).

    Args:
        req: Request with building_name, room_number, and optional department.

    Returns:
        SimpleOK indicating success or failure.
    """
    _assert_expected_version(req.expected_version)
    ok, err = core.set_room_department(req.building_name, req.room_number, req.department)
    if ok:
        bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="room_designation_set",
            entity_type="room",
            entity_id=f"{req.building_name}__{req.room_number}",
            message="עודכנה זירה ייעודית לחדר",
            details={"department": req.department or ""},
        )
    return SimpleOK(ok=ok, detail=err)


@router.post("/auto_assign")
def auto_assign(
    req: AutoAssignRequest,
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Automatically assign all currently unassigned personnel.

    Args:
        req: Optional department scope for the run.

    Returns:
        Structured report of assignments, already-assigned people, and failures.
    """
    try:
        _assert_expected_version(req.expected_version)
        result = core.assign_all_unassigned(department=req.department)
        if result["assigned_count"] > 0:
            bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="auto_assign",
            entity_type="rooms",
            entity_id=req.department or "all",
            message="שיבוץ אוטומטי הורץ",
            details=result,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/load_personnel_from_url")
def load_personnel_from_url(
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Load personnel from the configured URL in settings.

    Returns:
        Dict with ok status and count of loaded personnel.
    """
    settings = load_settings()
    url = settings.get("personnel_url", "").strip()
    try:
        result = run_personnel_sync_from_configured_source(
            url,
            trigger="manual",
            actor_role=session.role,
            actor_department=_actor_department(session),
        )
        if result["changed"] or result["room_state_changed"]:
            bump_version()
        return {
            "ok": True,
            "count": result["count"],
            "integrity_report": result["integrity_report"],
            "changed": result["changed"],
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"שגיאה בטעינה מ-URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload_personnel")
async def upload_personnel_file(
    file: UploadFile = File(...),
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Upload a personnel file to load personnel.

    Args:
        file: Excel or CSV file with columns: person_id, full_name, department, gender, rank.

    Returns:
        Dict with ok status and count of loaded personnel.
    """
    try:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="הקובץ גדול מדי. גודל מרבי: 10MB")
        filename = (file.filename or "").lower()
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        result = load_personnel_dataframe(df)
        if result["changed"] or result["room_state_changed"]:
            bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="personnel_upload",
            entity_type="personnel",
            entity_id=file.filename or "upload",
            message="קובץ כוח אדם נטען",
            details={
                "count": result["count"],
                "integrity_report": result["integrity_report"],
            },
        )
        return {
            "ok": True,
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/personnel-sync-status")
def personnel_sync_status(
    session: AuthSession = Depends(require_admin),
) -> dict:
    status = get_sync_status(store)
    settings = load_settings()
    return {
        **status,
        "configured": bool(str(settings.get("personnel_url", "")).strip()),
        "paused": bool(settings.get("personnel_sync_paused", False)),
        "interval_seconds": int(settings.get("personnel_sync_interval_seconds", 30)),
    }


@router.post("/personnel-sync/run-now")
def run_personnel_sync_now(
    session: AuthSession = Depends(require_admin),
) -> dict:
    settings = load_settings()
    url = str(settings.get("personnel_url", "")).strip()
    try:
        result = run_personnel_sync_from_configured_source(
            url,
            trigger="manual",
            actor_role=session.role,
            actor_department=_actor_department(session),
        )
        if result["changed"] or result["room_state_changed"]:
            bump_version()
        return {
            "ok": True,
            "count": result["count"],
            "changed": result["changed"],
            "integrity_report": result["integrity_report"],
            "sync_status": get_sync_status(store),
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"שגיאה בטעינה מ-URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/audit-log")
def get_audit_log(
    limit: int = 50,
    session: AuthSession = Depends(require_admin),
) -> dict:
    del session
    return {"items": list_audit_events(store, limit=max(1, min(limit, 200)))}


@router.post("/reset-all", response_model=SimpleOK)
def reset_all(session: AuthSession = Depends(require_admin)) -> SimpleOK:
    """Wipe all rooms and personnel data."""
    store.delete_all("rooms")
    store.delete_all("personnel")
    bump_version()
    append_audit_event(
        store,
        actor_role=session.role,
        actor_department=_actor_department(session),
        action="reset_all",
        entity_type="system",
        entity_id="all",
        message="כל הנתונים אופסו",
    )
    logger.info("All rooms and personnel data reset by %s", session.role)
    return SimpleOK(ok=True)
