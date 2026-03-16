"""Settings management endpoints — admin only."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from src.backend.auth_session import AuthSession, require_admin
from src.backend.dependencies import bump_version, core, reload_runtime_settings, store
import uuid

from src.backend.runtime_meta import append_audit_event, get_sync_status, prune_audit_log, save_audit_snapshot
from src.backend.settings import (
    DEFAULTS,
    default_department_password,
    load_settings,
    save_settings,
    validate_personnel_source_url,
)

import logging as _logging

_logger = _logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])

_HE_RANGE = range(0x0590, 0x0600)


def _he_error(exc: Exception, fallback: str = "שגיאה בעיבוד הבקשה") -> str:
    """Return Hebrew error msg; replace English-only exceptions with fallback."""
    msg = str(exc).strip()
    if msg and any(ord(ch) in _HE_RANGE for ch in msg):
        return msg if len(msg) <= 200 else msg[:199] + "…"
    _logger.warning("Suppressed English error: %s", msg)
    return fallback


def _clean_string_list(value: Any, *, field_name: str) -> list[str]:
    """Deduplicate and strip a raw list of strings from user input.

    Args:
        value: The raw value expected to be a list of strings.
        field_name: Human-readable field name used in error messages.

    Returns:
        A deduplicated list of non-empty stripped strings.

    Raises:
        ValueError: If *value* is not a list or yields no valid items.
    """
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
    """Merge and validate an incoming settings payload against the current or default settings.

    Args:
        payload: Partial or full settings dictionary from the client.
        replace: When True, start from DEFAULTS instead of the persisted
            settings.

    Returns:
        A fully merged and validated settings dictionary.

    Raises:
        ValueError: If any field in *payload* fails validation.
    """
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

    if "api_key" in payload:
        base["api_key"] = str(payload["api_key"] or "").strip()

    if "personnel_sync_paused" in payload:
        base["personnel_sync_paused"] = bool(payload["personnel_sync_paused"])

    if "bed_reservation_policy" in payload:
        policy = str(payload["bed_reservation_policy"] or "reserve").strip()
        if policy not in ("reserve", "best_effort"):
            raise ValueError("מדיניות שמירת מיטות חייבת להיות 'reserve' או 'best_effort'")
        base["bed_reservation_policy"] = policy

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
    """Return all personnel rows sorted by person_id for deterministic export."""
    return sorted(store.get_all("personnel"), key=lambda row: str(row["person_id"]))


def _serialize_rooms_for_export() -> list[dict[str, Any]]:
    """Return all rooms with occupant state, sorted by building then room number."""
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
    """Replace all rows of a store table with the given backup rows.

    Args:
        table: Store table name to restore.
        rows: List of row dicts to insert after clearing.
    """
    store.delete_all(table)
    for row in rows:
        store.insert(table, row)


def _enriched_sync_status(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Build a sync-status dict enriched with configuration flags.

    Args:
        settings: The current application settings.

    Returns:
        Dict combining persisted sync status with configuration metadata.
    """
    return {
        **get_sync_status(store),
        "configured": bool(str(settings.get("personnel_url", "")).strip()),
        "paused": bool(settings.get("personnel_sync_paused", False)),
        "interval_seconds": int(settings.get("personnel_sync_interval_seconds", 30)),
    }


@router.post("/admin/settings/check-impact")
def check_settings_impact(
    body: Dict[str, Any],
    session: AuthSession = Depends(require_admin),
) -> Dict[str, Any]:
    """Preview what data would be affected if settings were saved.

    Args:
        body: Proposed settings payload to evaluate.

    Returns:
        Dict with ``has_impact`` flag, human-readable detail strings, and
        lists of affected personnel/rooms.
    """
    del session
    try:
        proposed = _sanitize_settings(body, replace=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_he_error(exc))

    current = load_settings()
    removed_depts = set(current["departments"]) - set(proposed["departments"])
    removed_ranks = set(current["ranks_high_to_low"]) - set(proposed["ranks_high_to_low"])
    removed_genders = set(current["genders"]) - set(proposed["genders"])
    removed_buildings = set(current["buildings"]) - set(proposed["buildings"])

    if not (removed_depts or removed_ranks or removed_genders or removed_buildings):
        return {"has_impact": False, "details": []}

    personnel = store.get_all("personnel")
    rooms = store.get_all("rooms")
    details: list[str] = []

    for dept in sorted(removed_depts):
        count = sum(1 for p in personnel if p.get("department") == dept)
        if count:
            details.append(f"הסרת הזירה '{dept}' תמחק {count} אנשי כוח אדם")

    for rank in sorted(removed_ranks):
        p_count = sum(1 for p in personnel if p.get("rank") == rank)
        r_count = sum(1 for r in rooms if r.get("room_rank") == rank)
        parts = []
        if p_count:
            parts.append(f"{p_count} אנשי כוח אדם")
        if r_count:
            parts.append(f"{r_count} חדרים")
        if parts:
            details.append(f"הסרת הדרגה '{rank}' תמחק " + " ו-".join(parts))

    for gender in sorted(removed_genders):
        p_count = sum(1 for p in personnel if p.get("gender") == gender)
        r_count = sum(1 for r in rooms if r.get("gender") == gender)
        parts = []
        if p_count:
            parts.append(f"{p_count} אנשי כוח אדם")
        if r_count:
            parts.append(f"{r_count} חדרים")
        if parts:
            details.append(f"הסרת המגדר '{gender}' תמחק " + " ו-".join(parts))

    for building in sorted(removed_buildings):
        count = sum(1 for r in rooms if r.get("building_name") == building)
        if count:
            details.append(f"הסרת המבנה '{building}' תמחק {count} חדרים")

    affected_personnel = [
        p for p in personnel
        if p.get("department") in removed_depts
        or p.get("rank") in removed_ranks
        or p.get("gender") in removed_genders
    ]
    affected_rooms = [
        r for r in rooms
        if r.get("building_name") in removed_buildings
        or r.get("room_rank") in removed_ranks
        or r.get("gender") in removed_genders
    ]

    return {
        "has_impact": len(details) > 0,
        "details": details,
        "affected_personnel": affected_personnel,
        "affected_rooms": affected_rooms,
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
        raise HTTPException(status_code=400, detail=_he_error(exc))

    settings_backup = load_settings()
    rooms_backup = store.get_all("rooms")
    personnel_backup = store.get_all("personnel")

    try:
        snapshot_event_id = uuid.uuid4().hex
        save_audit_snapshot(store, snapshot_event_id, ["settings", "rooms", "personnel", "saved_assignments"])
        save_settings(settings)
        reload_runtime_settings()
        # Clean up saved_assignments when policy changes away from "reserve"
        if (
            settings.get("bed_reservation_policy") != "reserve"
            and settings_backup.get("bed_reservation_policy", "reserve") == "reserve"
        ):
            store.delete_all("saved_assignments")
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
                "snapshot_event_id": snapshot_event_id,
            },
        )
        prune_audit_log(store)
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
        raise HTTPException(status_code=400, detail=_he_error(exc))


@router.get("/admin/setup-package")
def export_setup_package(session: AuthSession = Depends(require_admin)) -> Dict[str, Any]:
    """Export settings only (ranks, departments, buildings, genders, passwords, policies).

    Returns:
        Versioned dict containing settings snapshot.
    """
    del session
    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "settings": load_settings(),
    }


@router.post("/admin/setup-package")
def import_setup_package(
    body: Dict[str, Any],
    session: AuthSession = Depends(require_admin),
) -> Dict[str, Any]:
    """Import a settings-only package.

    Args:
        body: Setup-package dict containing a ``settings`` key.

    Returns:
        Dict with ok status and updated settings.
    """
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="גוף בקשת חבילת ההגדרה חייב להיות אובייקט JSON")

    settings_payload = body.get("settings")

    if not isinstance(settings_payload, dict):
        raise HTTPException(status_code=400, detail="חבילת ההגדרה חסרה אובייקט הגדרות תקין")

    settings_backup = load_settings()

    try:
        snapshot_event_id = uuid.uuid4().hex
        save_audit_snapshot(store, snapshot_event_id, ["settings", "rooms", "personnel", "saved_assignments"])
        next_settings = _sanitize_settings(settings_payload, replace=True)
        save_settings(next_settings)
        reload_runtime_settings()

        integrity_report = core.reconcile_runtime_state()
        bump_version()
        append_audit_event(
            store,
            actor_role=session.role,
            actor_department=session.department,
            action="setup_import",
            entity_type="settings",
            entity_id="setup-package",
            message="הגדרות יובאו",
            details={
                "integrity_report": integrity_report,
                "snapshot_event_id": snapshot_event_id,
            },
        )
        prune_audit_log(store)
        return {
            "ok": True,
            "settings": next_settings,
            "integrity_report": integrity_report,
            "sync_status": _enriched_sync_status(next_settings),
        }
    except Exception as exc:
        save_settings(settings_backup)
        reload_runtime_settings()
        raise HTTPException(status_code=400, detail=_he_error(exc))
