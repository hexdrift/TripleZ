"""Settings management endpoints — admin only."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from src.backend.auth_session import AuthSession, require_admin
from src.backend.dependencies import bump_version, core, reload_runtime_settings, store
from src.backend.runtime_meta import append_audit_event, get_sync_status
from src.backend.settings import (
    DEFAULTS,
    default_department_password,
    load_settings,
    save_settings,
    validate_personnel_source_url,
)

router = APIRouter(dependencies=[Depends(require_admin)])


def _clean_string_list(value: Any, *, field_name: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"השדה '{field_name}' חייב להיות רשימת טקסטים")

    items: list[str] = []
    seen: set[str] = set()
    for raw in value:
        item = str(raw).strip()
        if item and item not in seen:
            items.append(item)
            seen.add(item)

    if not items:
        raise ValueError(f"השדה '{field_name}' חייב להכיל לפחות ערך אחד")
    return items


def _sanitize_settings(payload: Dict[str, Any], *, replace: bool = False) -> Dict[str, Any]:
    base = deepcopy(DEFAULTS if replace else load_settings())

    if "ranks_high_to_low" in payload:
        base["ranks_high_to_low"] = _clean_string_list(payload["ranks_high_to_low"], field_name="ranks_high_to_low")
    if "genders" in payload:
        base["genders"] = _clean_string_list(payload["genders"], field_name="genders")
    if "departments" in payload:
        base["departments"] = _clean_string_list(payload["departments"], field_name="departments")
    if "buildings" in payload:
        base["buildings"] = _clean_string_list(payload["buildings"], field_name="buildings")

    if "personnel_url" in payload:
        base["personnel_url"] = validate_personnel_source_url(payload["personnel_url"])

    if "personnel_sync_paused" in payload:
        base["personnel_sync_paused"] = bool(payload["personnel_sync_paused"])

    if "admin_password" in payload:
        admin_password = str(payload["admin_password"] or "").strip()
        if not admin_password:
            raise ValueError("סיסמת המנהל לא יכולה להיות ריקה")
        base["admin_password"] = admin_password

    dept_passwords = base.get("dept_passwords", {})
    if "dept_passwords" in payload:
        raw_passwords = payload["dept_passwords"]
        if not isinstance(raw_passwords, dict):
            raise ValueError("השדה dept_passwords חייב להיות אובייקט")
        dept_passwords = {
            str(key).strip(): str(value or "").strip()
            for key, value in raw_passwords.items()
            if str(key).strip()
        }

    base["dept_passwords"] = {
        department: str(dept_passwords.get(department, "")).strip() or default_department_password(department)
        for department in base["departments"]
    }
    base["personnel_sync_interval_seconds"] = DEFAULTS["personnel_sync_interval_seconds"]
    base["auto_assign_policy"] = DEFAULTS["auto_assign_policy"]
    return base


def _serialize_personnel_for_export() -> list[dict[str, Any]]:
    return sorted(store.get_all("personnel"), key=lambda row: str(row["person_id"]))


def _serialize_rooms_for_export() -> list[dict[str, Any]]:
    rooms = core.rooms_with_state()
    if rooms.empty:
        return []

    records: list[dict[str, Any]] = []
    for row in rooms.to_dict(orient="records"):
        records.append({
            "building_name": row["building_name"],
            "room_number": row["room_number"],
            "number_of_beds": row["number_of_beds"],
            "room_rank": row["room_rank"],
            "gender": row["gender"],
            "designated_department": row.get("designated_department") or "",
            "occupant_ids": row.get("occupant_ids") or [],
        })

    return sorted(records, key=lambda row: (str(row["building_name"]), int(row["room_number"])))


def _restore_table(table: str, rows: list[dict[str, Any]]) -> None:
    store.delete_all(table)
    for row in rows:
        store.insert(table, row)


def _enriched_sync_status(settings: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **get_sync_status(store),
        "configured": bool(str(settings.get("personnel_url", "")).strip()),
        "paused": bool(settings.get("personnel_sync_paused", False)),
        "interval_seconds": int(settings.get("personnel_sync_interval_seconds", 30)),
    }


@router.get("/admin/settings")
def get_settings(session: AuthSession = Depends(require_admin)) -> Dict[str, Any]:
    """Return the current application settings.

    Returns:
        Dictionary of all configurable settings.
    """
    del session
    settings = load_settings()
    return {**settings, "sync_status": _enriched_sync_status(settings)}


@router.put("/admin/settings")
def update_settings(
    body: Dict[str, Any],
    session: AuthSession = Depends(require_admin),
) -> Dict[str, Any]:
    """Update application settings and persist to disk.

    Args:
        body: Partial or full settings dictionary. Only provided keys are updated.

    Returns:
        The merged settings after the update.
    """
    try:
        settings = _sanitize_settings(body, replace=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    settings_backup = load_settings()
    rooms_backup = store.get_all("rooms")
    personnel_backup = store.get_all("personnel")

    try:
        save_settings(settings)
        reload_runtime_settings()
        integrity_report = core.reconcile_runtime_state()
        bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=session.department,
            action="settings_update",
            entity_type="settings",
            entity_id="runtime",
            message="הגדרות המערכת נשמרו",
            details={
                "integrity_report": integrity_report,
                "personnel_url_configured": bool(settings.get("personnel_url")),
                "sync_interval_seconds": settings.get("personnel_sync_interval_seconds"),
                "sync_paused": settings.get("personnel_sync_paused"),
                "auto_assign_policy": settings.get("auto_assign_policy"),
            },
        )
        return {
            **settings,
            "integrity_report": integrity_report,
            "sync_status": _enriched_sync_status(settings),
        }
    except Exception as exc:
        save_settings(settings_backup)
        reload_runtime_settings()
        _restore_table("rooms", rooms_backup)
        _restore_table("personnel", personnel_backup)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/admin/setup-package")
def export_setup_package(session: AuthSession = Depends(require_admin)) -> Dict[str, Any]:
    """Export settings, rooms, and personnel as a reproducible setup package."""
    del session
    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "settings": load_settings(),
        "rooms": _serialize_rooms_for_export(),
        "personnel": _serialize_personnel_for_export(),
    }


@router.post("/admin/setup-package")
def import_setup_package(
    body: Dict[str, Any],
    session: AuthSession = Depends(require_admin),
) -> Dict[str, Any]:
    """Import a full setup package atomically."""
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="גוף בקשת חבילת ההגדרה חייב להיות אובייקט JSON")

    settings_payload = body.get("settings")
    rooms_payload = body.get("rooms")
    personnel_payload = body.get("personnel")

    if not isinstance(settings_payload, dict):
        raise HTTPException(status_code=400, detail="חבילת ההגדרה חסרה אובייקט הגדרות תקין")
    if not isinstance(rooms_payload, list):
        raise HTTPException(status_code=400, detail="חבילת ההגדרה חסרה רשימת חדרים תקינה")
    if not isinstance(personnel_payload, list):
        raise HTTPException(status_code=400, detail="חבילת ההגדרה חסרה רשימת כוח אדם תקינה")

    settings_backup = load_settings()
    rooms_backup = store.get_all("rooms")
    personnel_backup = store.get_all("personnel")

    try:
        next_settings = _sanitize_settings(settings_payload, replace=True)
        save_settings(next_settings)
        reload_runtime_settings()

        personnel_df = pd.DataFrame(personnel_payload, columns=list(core.REQUIRED_PERSONNEL_COLS))
        rooms_df = pd.DataFrame(
            rooms_payload,
            columns=[*core.REQUIRED_ROOM_COLS, core.occupant_ids_col, "designated_department"],
        )

        core.load_personnel(personnel_df)
        core.load_rooms(rooms_df)
        integrity_report = core.reconcile_runtime_state()
        bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=session.department,
            action="setup_import",
            entity_type="settings",
            entity_id="setup-package",
            message="חבילת הגדרה יובאה",
            details={
                "personnel_count": len(personnel_payload),
                "room_count": len(rooms_payload),
                "integrity_report": integrity_report,
            },
        )
        return {
            "ok": True,
            "settings": next_settings,
            "personnel_count": len(personnel_payload),
            "room_count": len(rooms_payload),
            "integrity_report": integrity_report,
            "sync_status": _enriched_sync_status(next_settings),
        }
    except Exception as exc:
        save_settings(settings_backup)
        reload_runtime_settings()
        _restore_table("rooms", rooms_backup)
        _restore_table("personnel", personnel_backup)
        raise HTTPException(status_code=400, detail=str(exc))
