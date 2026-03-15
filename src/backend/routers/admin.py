"""Admin endpoints for bulk loading and upserting data."""

from __future__ import annotations

import base64
import io
import json
import logging
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from config import (
    model_to_dict,
    normalize_department,
    normalize_department_lenient,
    normalize_gender,
    normalize_gender_lenient,
    normalize_name,
    normalize_name_lenient,
    normalize_rank,
    normalize_rank_lenient,
)
from src.backend.access import person_visible_to_session
from src.backend.auth_session import AuthSession, require_admin, require_admin_or_api_key, require_authenticated
from src.backend.dependencies import bump_version, core, get_data_version, mutation_lock, store
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

_HE_RANGE = range(0x0590, 0x0600)


def _has_hebrew(text: str) -> bool:
    """Check if text contains any Hebrew character."""
    return any(ord(ch) in _HE_RANGE for ch in text)


def _he_error(exc: Exception, fallback: str = "שגיאה בעיבוד הבקשה") -> str:
    """Return the exception message if it contains Hebrew, otherwise a fallback.

    Args:
        exc: The caught exception.
        fallback: Hebrew message to use when the original is English-only.

    Returns:
        A user-facing Hebrew error message.
    """
    msg = str(exc).strip()
    if msg and _has_hebrew(msg):
        return msg if len(msg) <= 200 else msg[:199] + "…"
    logger.warning("Suppressed English error: %s", msg)
    return fallback

PERSONNEL_HEADER_ALIASES = {
    "person_id": "person_id",
    "full_name": "full_name",
    "department": "department",
    "gender": "gender",
    "rank": "rank",
    "מספר אישי": "person_id",
    "מזהה": "person_id",
    "שם מלא": "full_name",
    "זירה": "department",
    "מגדר": "gender",
    "דרגה": "rank",
}

PERSONNEL_COL_HEBREW: dict[str, str] = {
    "person_id": "מספר אישי",
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
    "זירות": "designated_department",
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
    "designated_department": "זירות",
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
    if "person_id" not in normalized.columns:
        raise ValueError("חסרה עמודת מספר אישי (person_id) בטבלת כוח האדם")

    # Fill missing optional columns with empty string
    for col in ("full_name", "department", "gender", "rank"):
        if col not in normalized.columns:
            normalized[col] = ""

    records: list[dict] = []
    seen_person_ids: set[str] = set()

    for _, row in normalized.iterrows():
        person_id = str(row["person_id"]).strip()
        if not person_id or person_id.lower() == "nan":
            continue
        if person_id in seen_person_ids:
            raise ValueError(f"מספר אישי כפול '{person_id}' בנתוני כוח האדם.")
        seen_person_ids.add(person_id)
        records.append({
            "person_id": person_id,
            "full_name": normalize_name_lenient(row["full_name"]),
            "department": normalize_department_lenient(row["department"]),
            "gender": normalize_gender_lenient(row["gender"]),
            "rank": normalize_rank_lenient(row["rank"]),
        })

    return records


def _serialize_personnel_rows(rows: list[dict]) -> list[dict]:
    """Normalize personnel rows to a canonical set of fields, sorted by person_id.

    Args:
        rows: Raw personnel dicts from the store.

    Returns:
        Sorted list of dicts with only the canonical personnel fields.
    """
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
    """Persist normalized personnel rows and reconcile room state.

    Args:
        records: List of canonical personnel dicts to load.

    Returns:
        Result dict with ok status, count, change flags, integrity report,
        and optional removed-occupant / auto-reassigned details.
    """
    with mutation_lock():
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

        old_personnel_map = {str(p["person_id"]): p for p in personnel_backup}

        old_room_assignments: dict[str, dict] = {}
        for room in rooms_backup:
            for pid in json.loads(room.get("occupant_ids", "[]")):
                old_room_assignments[str(pid)] = {
                    "building_name": room["building_name"],
                    "room_number": int(room["room_number"]),
                }

        try:
            df = pd.DataFrame(records, columns=list(core.REQUIRED_PERSONNEL_COLS))
            new_person_ids = {str(r["person_id"]) for r in records}
            core.load_personnel(df)

            auto_reassigned = _restore_returning_personnel(new_person_ids)

            integrity_report = core.reconcile_runtime_state()

            removed_occupants = integrity_report.get("removed_occupants", [])
            enriched_removed: list[dict] = []
            if removed_occupants:
                enriched_removed = _save_stripped_assignments(
                    removed_occupants, old_personnel_map, old_room_assignments,
                )

            result: dict = {
                "ok": True,
                "count": len(df),
                "changed": True,
                "room_state_changed": bool(integrity_report.get("has_changes")) or bool(auto_reassigned),
                "integrity_report": integrity_report,
            }

            if enriched_removed:
                result["removed_occupants"] = {
                    "items": enriched_removed,
                    "message": f"{len(enriched_removed)} אנשים הוסרו משיבוצים ושמורים לחזרה",
                    "excel_base64": _build_removed_occupants_excel(enriched_removed),
                }

            if auto_reassigned:
                result["auto_reassigned"] = auto_reassigned

            return result
        except Exception:
            _restore_table("rooms", rooms_backup)
            _restore_table("personnel", personnel_backup)
            raise


def load_personnel_dataframe(df: pd.DataFrame) -> dict:
    """Normalize, validate, and persist a personnel DataFrame.

    Args:
        df: Raw personnel DataFrame (may have Hebrew column names).

    Returns:
        Result dict from ``_load_personnel_records``.
    """
    records = _normalize_personnel_records(df)
    return _load_personnel_records(records)


def load_personnel_from_url_source(url: str) -> dict:
    """Fetch personnel from a remote URL and load it into the runtime store.

    Args:
        url: Remote URL pointing to an Excel or CSV personnel file.

    Returns:
        Result dict from ``load_personnel_dataframe``.

    Raises:
        ValueError: If the URL is empty or fails validation.
        requests.RequestException: On network or HTTP errors.
    """
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
    """Fetch a personnel source while revalidating every redirect target.

    Args:
        url: Starting URL to fetch.
        max_redirects: Maximum number of redirect hops allowed.

    Returns:
        Tuple of (response, final_url) after following redirects.

    Raises:
        ValueError: If a redirect target fails URL validation or too many
            redirects are encountered.
    """
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
        "person_id": "מספר אישי",
        "building_name": "מבנה",
        "room_number": "חדר",
        "room_gender": "מגדר חדר",
        "room_rank": "דרגת חדר",
        "designated_department": "זירות",
    })
    df = _sanitize_excel_dataframe(df)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _validate_occupant_ids(df: pd.DataFrame) -> list[dict]:
    """Validate occupant_ids against known personnel, removing unknown ones in-place.

    Args:
        df: Rooms DataFrame whose ``occupant_ids`` column is mutated to
            contain only known person IDs.

    Returns:
        List of dicts describing unknown personnel that were stripped.
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
                    "room_gender": str(row.get("gender", "")),
                    "room_rank": str(row.get("room_rank", "")),
                    "designated_department": str(row.get("designated_department", "")),
                })
        df.at[idx, "occupant_ids"] = valid_ids

    return unknown_personnel


def _build_removed_occupants_excel(removed: list[dict]) -> str:
    """Build an Excel file from removed occupants and return as base64 string."""
    df = pd.DataFrame(removed)
    df = df.rename(columns={
        "person_id": "מספר אישי",
        "full_name": "שם מלא",
        "department": "זירה",
        "gender": "מגדר",
        "rank": "דרגה",
        "building_name": "מבנה",
        "room_number": "חדר",
    })
    df = _sanitize_excel_dataframe(df)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _save_stripped_assignments(
    removed_occupants: list[dict],
    old_personnel_map: dict[str, dict],
    old_room_assignments: dict[str, dict],
) -> list[dict]:
    """Save stripped occupants to saved_assignments table.

    Args:
        removed_occupants: List of dicts with at least a ``person_id`` key,
            representing occupants removed during reconciliation.
        old_personnel_map: Mapping of person_id to their pre-sync personnel
            record.
        old_room_assignments: Mapping of person_id to their pre-sync room
            assignment (building_name and room_number).

    Returns:
        Enriched list of removed occupants with full personnel and room
        details.
    """
    now = datetime.now(timezone.utc).isoformat()
    enriched: list[dict] = []

    for entry in removed_occupants:
        pid = entry["person_id"]
        person = old_personnel_map.get(pid)
        if person is None:
            continue

        room_info = old_room_assignments.get(pid, entry)
        record = {
            "person_id": pid,
            "building_name": str(room_info.get("building_name", "")),
            "room_number": int(room_info.get("room_number", 0)),
            "full_name": str(person.get("full_name", "")),
            "department": str(person.get("department", "")),
            "gender": str(person.get("gender", "")),
            "rank": str(person.get("rank", "")),
            "saved_at": now,
        }

        existing = store.get_by_id("saved_assignments", pid)
        if existing:
            store.update("saved_assignments", pid, record)
        else:
            store.insert("saved_assignments", record)

        enriched.append(record)

    return enriched


def _restore_returning_personnel(new_person_ids: set[str]) -> list[dict]:
    """Auto-reassign returning people from saved_assignments.

    Args:
        new_person_ids: Set of person IDs present in the incoming personnel
            data.

    Returns:
        List of dicts describing people who were automatically reassigned
        back to their saved rooms.
    """
    settings = load_settings()
    policy = settings.get("bed_reservation_policy", "reserve")

    saved = store.get_all("saved_assignments")
    if not saved:
        return []

    reassigned: list[dict] = []
    for entry in saved:
        pid = entry["person_id"]
        if pid not in new_person_ids:
            continue

        building = entry["building_name"]
        room_number = int(entry["room_number"])
        room_id = f"{building}__{room_number}"
        room = store.get_by_id("rooms", room_id)
        if room is None:
            store.delete("saved_assignments", pid)
            continue

        person = store.get_by_id("personnel", pid)
        if person is None:
            store.delete("saved_assignments", pid)
            continue

        if person["gender"] != room["gender"]:
            store.delete("saved_assignments", pid)
            continue

        occupant_ids = json.loads(room["occupant_ids"])
        if pid in occupant_ids:
            store.delete("saved_assignments", pid)
            continue

        available = room["number_of_beds"] - len(occupant_ids)
        if available <= 0:
            store.delete("saved_assignments", pid)
            continue

        occupant_ids.append(pid)
        store.update("rooms", room_id, {"occupant_ids": json.dumps(occupant_ids)})
        store.delete("saved_assignments", pid)
        reassigned.append({
            "person_id": pid,
            "full_name": person["full_name"],
            "building_name": building,
            "room_number": room_number,
        })

    return reassigned


def _purge_orphan_saved_assignments() -> None:
    """Delete saved_assignments referencing rooms that no longer exist."""
    room_ids = {r["room_id"] for r in store.get_all("rooms")}
    for sa in store.get_all("saved_assignments"):
        room_id = f"{sa['building_name']}__{sa['room_number']}"
        if room_id not in room_ids:
            store.delete("saved_assignments", sa["person_id"])


def _build_warnings(unknown_personnel: list[dict]) -> dict:
    """Build the warnings dict for unknown personnel, or empty dict.

    Args:
        unknown_personnel: List of dicts describing personnel IDs found in
            room occupant lists but not in the personnel table.

    Returns:
        Dict with a ``warnings`` key containing message, details, and an
        Excel base64 attachment, or an empty dict when there are none.
    """
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
    """Replace all rows of a store table with the given backup rows.

    Args:
        table: Store table name to restore.
        rows: List of row dicts to insert after clearing.
    """
    store.delete_all(table)
    for row in rows:
        store.insert(table, row)


def _actor_department(session: AuthSession | None) -> str | None:
    """Extract the actor's department for audit logging.

    Args:
        session: The current authenticated session, or None.

    Returns:
        The department name when the actor is a manager, otherwise None.
    """
    return session.department if session and session.role == "manager" else None


def _assert_expected_version(expected_version: int | None) -> None:
    """Raise HTTP 409 if the client's expected version is stale.

    Args:
        expected_version: Data version the client last saw, or None to skip
            the check.

    Raises:
        HTTPException: 409 when the current server version differs from
            ``expected_version``.
    """
    if expected_version is None:
        return
    current_version = get_data_version()
    if int(expected_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail="הנתונים השתנו בינתיים. יש לרענן את המסך ולנסות שוב.",
        )


def _sync_status_base_update(*, trigger: str) -> dict:
    """Build the base sync-status update fields for a sync attempt.

    Args:
        trigger: Label describing what initiated the sync (e.g. "manual",
            "scheduled").

    Returns:
        Dict with ``last_attempt_at`` timestamp and ``last_trigger``.
    """
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
    """Execute a full personnel sync from the configured remote source.

    Args:
        url: Remote personnel source URL.
        trigger: Label describing what initiated the sync.
        actor_role: Role to record in the audit log entry.
        actor_department: Department to record in the audit log entry.

    Returns:
        Result dict from ``load_personnel_from_url_source`` with count,
        change flags, and integrity report.

    Raises:
        ValueError: If the URL is empty or fails validation.
        requests.RequestException: On network or HTTP errors.
    """
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
    sync_audit_details: dict = {
        "trigger": trigger,
        "count": result["count"],
        "changed": result["changed"],
        "room_state_changed": result["room_state_changed"],
        "integrity_report": result["integrity_report"],
    }
    if result.get("removed_occupants"):
        sync_audit_details["removed_occupants"] = result["removed_occupants"]["items"]
    if result.get("auto_reassigned"):
        sync_audit_details["auto_reassigned"] = result["auto_reassigned"]
    append_audit_event(
        store,
        actor_role=actor_role,
        actor_department=actor_department,
        action="personnel_sync",
        entity_type="personnel",
        entity_id="source",
        message=f"סנכרון כוח אדם הושלם ({trigger})",
        details=sync_audit_details,
    )
    return result

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin_or_api_key)])


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
        with mutation_lock():
            core.load_rooms(df)
            _purge_orphan_saved_assignments()
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


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
        with mutation_lock():
            _assert_expected_version(req.expected_version)
            df = pd.DataFrame([model_to_dict(r, exclude_unset=True) for r in req.rooms])
            if df.empty:
                return {"updated": 0, "added": 0, "total_rooms": len(core.rooms_with_state())}
            result = core.upsert_rooms(df)
            integrity_report = core.reconcile_runtime_state()
            bump_version()
            if integrity_report.get("has_changes"):
                result["integrity_report"] = integrity_report
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
        raise HTTPException(status_code=400, detail=_he_error(e))


@router.post("/load_personnel")
def admin_load_personnel(
    req: PersonnelLoadRequest,
    session: AuthSession = Depends(require_admin_or_api_key),
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
        audit_details: dict = {
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
        if result.get("removed_occupants"):
            audit_details["removed_occupants"] = result["removed_occupants"]["items"]
        if result.get("auto_reassigned"):
            audit_details["auto_reassigned"] = result["auto_reassigned"]
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="personnel_load",
            entity_type="personnel",
            entity_id="bulk",
            message="רשימת כוח האדם הוחלפה ידנית",
            details=audit_details,
        )
        response: dict = {
            "ok": True,
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
        if result.get("removed_occupants"):
            response["removed_occupants"] = result["removed_occupants"]
        if result.get("auto_reassigned"):
            response["auto_reassigned"] = result["auto_reassigned"]
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


@router.post("/create_personnel", response_model=SimpleOK)
def admin_create_personnel(
    req: PersonnelCreate,
    session: AuthSession = Depends(require_admin),
) -> SimpleOK:
    """Create a single personnel record without replacing existing data."""
    person_id = str(req.person_id).strip()
    if not person_id:
        raise HTTPException(status_code=400, detail="יש להזין מספר אישי")

    existing = store.get_by_id("personnel", person_id)
    if existing is not None:
        raise HTTPException(status_code=400, detail=f"מספר אישי {person_id} כבר קיים")

    try:
        row = model_to_dict(req)
        row["person_id"] = person_id
        store.insert("personnel", row)
        bump_version()
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
        raise HTTPException(status_code=400, detail=_he_error(e))


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
        with mutation_lock():
            core.load_rooms(df)
            _purge_orphan_saved_assignments()
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


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
    with mutation_lock():
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
                message="עודכנו זירות לחדר",
                details={"department": req.department or ""},
            )
    return SimpleOK(ok=ok, detail=err)


@router.post("/auto_assign")
def auto_assign(
    req: AutoAssignRequest,
    session: AuthSession = Depends(require_authenticated),
) -> dict:
    """Automatically assign all currently unassigned personnel.

    Admins can assign any department; managers are scoped to their own department.

    Args:
        req: Optional filters (department, gender, rank, person_ids).

    Returns:
        Structured report of assignments, already-assigned people, and failures.
    """
    # Managers are forced to their own department
    department = req.department
    if session.role == "manager":
        department = session.department
    elif session.role != "admin":
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מתאימות")

    try:
        with mutation_lock():
            _assert_expected_version(req.expected_version)
            result = core.assign_all_unassigned(
                department=department,
                gender=req.gender,
                rank=req.rank,
                person_ids=req.person_ids,
            )
            if result["assigned_count"] > 0:
                bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="auto_assign",
            entity_type="rooms",
            entity_id=department or "all",
            message="שיבוץ אוטומטי הורץ",
            details=result,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


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
        raise HTTPException(status_code=400, detail="שגיאה בטעינה מ-URL")
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


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
        upload_audit_details: dict = {
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
        if result.get("removed_occupants"):
            upload_audit_details["removed_occupants"] = result["removed_occupants"]["items"]
        if result.get("auto_reassigned"):
            upload_audit_details["auto_reassigned"] = result["auto_reassigned"]
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=_actor_department(session),
            action="personnel_upload",
            entity_type="personnel",
            entity_id=file.filename or "upload",
            message="קובץ כוח אדם נטען",
            details=upload_audit_details,
        )
        response: dict = {
            "ok": True,
            "count": result["count"],
            "integrity_report": result["integrity_report"],
        }
        if result.get("removed_occupants"):
            response["removed_occupants"] = result["removed_occupants"]
        if result.get("auto_reassigned"):
            response["auto_reassigned"] = result["auto_reassigned"]
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


@router.get("/personnel-sync-status")
def personnel_sync_status(
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Return the current personnel sync status with configuration flags.

    Returns:
        Dict combining persisted sync status with configured/paused/interval
        metadata.
    """
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
    """Trigger an immediate personnel sync from the configured source URL.

    Returns:
        Dict with ok status, count, change flag, integrity report, and
        updated sync status.
    """
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
        raise HTTPException(status_code=400, detail="שגיאה בטעינה מ-URL")
    except Exception as e:
        raise HTTPException(status_code=400, detail=_he_error(e))


@router.get("/audit-log")
def get_audit_log(
    limit: int = 50,
    session: AuthSession = Depends(require_admin),
) -> dict:
    """Return the most recent audit log entries.

    Args:
        limit: Maximum number of entries to return (clamped to 1..200).

    Returns:
        Dict with an ``items`` list of audit event dicts.
    """
    del session
    return {"items": list_audit_events(store, limit=max(1, min(limit, 200)))}


@router.delete("/audit-log", response_model=SimpleOK)
def clear_audit_log(session: AuthSession = Depends(require_admin)) -> SimpleOK:
    """Delete all audit log entries."""
    del session
    store.delete_all("audit_log")
    return SimpleOK(ok=True)


@router.delete("/audit-log/{event_id}", response_model=SimpleOK)
def delete_audit_entry(event_id: str, session: AuthSession = Depends(require_admin)) -> SimpleOK:
    """Delete a single audit log entry."""
    del session
    existing = store.get_by_id("audit_log", event_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="רשומה לא נמצאה")
    store.delete("audit_log", event_id)
    return SimpleOK(ok=True)


@router.delete("/saved-assignment/{person_id}", response_model=SimpleOK)
def release_saved_assignment(
    person_id: str,
    session: AuthSession = Depends(require_authenticated),
) -> SimpleOK:
    """Remove a saved assignment (release bed reservation)."""
    existing = store.get_by_id("saved_assignments", person_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="לא נמצאה שמירה עבור מספר אישי זה")
    if session.role == "manager":
        person = store.get_by_id("personnel", person_id)
        if not person_visible_to_session(session, person):
            raise HTTPException(status_code=403, detail="אין הרשאה לשחרר שמירה עבור זירה אחרת")
    store.delete("saved_assignments", person_id)
    bump_version()
    append_audit_event(
        store,
        actor_role=session.role,
        actor_department=_actor_department(session),
        action="release_reservation",
        entity_type="saved_assignment",
        entity_id=person_id,
        message="שמירת מיטה שוחררה ידנית",
        details={
            "building_name": existing.get("building_name", ""),
            "room_number": existing.get("room_number", ""),
        },
    )
    return SimpleOK(ok=True)


@router.delete("/room/{building_name}/{room_number}", response_model=SimpleOK)
def delete_room(
    building_name: str,
    room_number: int,
    session: AuthSession = Depends(require_admin),
) -> SimpleOK:
    """Delete a single room and remove all its occupants."""
    room_id = f"{building_name}__{room_number}"
    existing = store.get_by_id("rooms", room_id)
    if not existing:
        raise HTTPException(status_code=404, detail="החדר לא נמצא")
    # Remove saved assignments for occupants in this room
    occupant_ids = json.loads(existing.get("occupant_ids", "[]"))
    for pid in occupant_ids:
        store.delete("saved_assignments", pid)
    store.delete("rooms", room_id)
    bump_version()
    append_audit_event(
        store,
        actor_role=session.role,
        actor_department=_actor_department(session),
        action="delete_room",
        entity_type="room",
        entity_id=room_id,
        message=f"חדר {room_number} במבנה {building_name} נמחק",
        details={"building_name": building_name, "room_number": room_number, "occupants_removed": len(occupant_ids)},
    )
    return SimpleOK(ok=True)


@router.delete("/person/{person_id}", response_model=SimpleOK)
def delete_person(
    person_id: str,
    session: AuthSession = Depends(require_admin),
) -> SimpleOK:
    """Delete a single person, unassign them from any room, and remove saved assignments."""
    existing = store.get_by_id("personnel", person_id)
    if not existing:
        raise HTTPException(status_code=404, detail="האדם לא נמצא")
    # Unassign from room if assigned
    core.unassign(person_id=person_id)
    # Remove saved assignment
    store.delete("saved_assignments", person_id)
    # Delete the person
    store.delete("personnel", person_id)
    bump_version()
    append_audit_event(
        store,
        actor_role=session.role,
        actor_department=_actor_department(session),
        action="delete_person",
        entity_type="person",
        entity_id=person_id,
        message=f"אדם {existing.get('full_name', person_id)} נמחק מהמערכת",
        details={"person_id": person_id, "full_name": existing.get("full_name", "")},
    )
    return SimpleOK(ok=True)


@router.post("/reset-all", response_model=SimpleOK)
def reset_all(session: AuthSession = Depends(require_admin)) -> SimpleOK:
    """Wipe all rooms, personnel, saved assignments, and audit log."""
    store.delete_all("rooms")
    store.delete_all("personnel")
    store.delete_all("saved_assignments")
    store.delete_all("audit_log")
    bump_version()
    append_audit_event(
        store,
        actor_role=session.role,
        actor_department=_actor_department(session),
        action="reset_all",
        entity_type="system",
        entity_id="all",
        message="כל הנתונים אופסו (כולל יומן ביקורת)",
    )
    logger.info("All data (rooms, personnel, saved assignments, audit log) reset by %s", session.role)
    return SimpleOK(ok=True)
