"""Persistence helpers for runtime metadata and audit events."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from src.backend.store.base import RemoteStore

SYNC_STATUS_KEY = "personnel_sync_status"

DEFAULT_SYNC_STATUS: dict[str, Any] = {
    "last_attempt_at": None,
    "last_success_at": None,
    "last_error": "",
    "last_count": 0,
    "last_changed": False,
    "last_trigger": "",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_meta(store: RemoteStore, key: str, default: Any) -> Any:
    row = store.get_by_id("app_meta", key)
    if not row:
        return default
    raw = row.get("value")
    if not isinstance(raw, str) or not raw.strip():
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def set_meta(store: RemoteStore, key: str, value: Any) -> None:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    existing = store.get_by_id("app_meta", key)
    if existing is None:
        store.insert("app_meta", {"key": key, "value": payload})
    else:
        store.update("app_meta", key, {"value": payload})


def get_sync_status(store: RemoteStore) -> dict[str, Any]:
    status = get_meta(store, SYNC_STATUS_KEY, DEFAULT_SYNC_STATUS)
    if not isinstance(status, dict):
        return dict(DEFAULT_SYNC_STATUS)
    return {**DEFAULT_SYNC_STATUS, **status}


def update_sync_status(store: RemoteStore, **updates: Any) -> dict[str, Any]:
    status = get_sync_status(store)
    status.update(updates)
    set_meta(store, SYNC_STATUS_KEY, status)
    return status


def append_audit_event(
    store: RemoteStore,
    *,
    action: str,
    message: str,
    actor_role: str = "system",
    actor_department: str | None = None,
    entity_type: str = "",
    entity_id: str = "",
    details: Any | None = None,
) -> dict[str, Any]:
    row = {
        "event_id": uuid.uuid4().hex,
        "created_at": _now_iso(),
        "actor_role": actor_role or "system",
        "actor_department": actor_department or "",
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "message": message,
        "details": json.dumps(details or {}, ensure_ascii=False, separators=(",", ":")),
    }
    store.insert("audit_log", row)
    return row


def list_audit_events(store: RemoteStore, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = sorted(
        store.get_all("audit_log"),
        key=lambda row: str(row.get("created_at", "")),
        reverse=True,
    )
    events: list[dict[str, Any]] = []
    for row in rows[: max(1, limit)]:
        details_raw = row.get("details")
        details: Any = {}
        if isinstance(details_raw, str) and details_raw.strip():
            try:
                details = json.loads(details_raw)
            except json.JSONDecodeError:
                details = {}
        events.append(
            {
                "event_id": str(row.get("event_id", "")),
                "created_at": str(row.get("created_at", "")),
                "actor_role": str(row.get("actor_role", "")),
                "actor_department": str(row.get("actor_department", "")),
                "action": str(row.get("action", "")),
                "entity_type": str(row.get("entity_type", "")),
                "entity_id": str(row.get("entity_id", "")),
                "message": str(row.get("message", "")),
                "details": details,
            }
        )
    return events
