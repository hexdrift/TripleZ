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
    """Return the current UTC time as an ISO 8601 string.

    Returns:
        ISO-formatted timestamp string.
    """
    return datetime.now(timezone.utc).isoformat()


def get_meta(store: RemoteStore, key: str, default: Any) -> Any:
    """Retrieve and deserialize a metadata value from the app_meta table.

    Args:
        store: The backing data store.
        key: Metadata key to look up.
        default: Value to return if the key is missing or cannot be parsed.

    Returns:
        The deserialized value, or *default* if not found or on parse error.
    """
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
    """Serialize and persist a metadata value in the app_meta table.

    Args:
        store: The backing data store.
        key: Metadata key to store under.
        value: Any JSON-serializable value to persist.
    """
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    existing = store.get_by_id("app_meta", key)
    if existing is None:
        store.insert("app_meta", {"key": key, "value": payload})
    else:
        store.update("app_meta", key, {"value": payload})


def get_sync_status(store: RemoteStore) -> dict[str, Any]:
    """Load the current personnel-sync status from the store.

    Missing fields are filled in from ``DEFAULT_SYNC_STATUS``.

    Args:
        store: The backing data store.

    Returns:
        Dict with sync status fields (last_attempt_at, last_success_at, etc.).
    """
    status = get_meta(store, SYNC_STATUS_KEY, DEFAULT_SYNC_STATUS)
    if not isinstance(status, dict):
        return dict(DEFAULT_SYNC_STATUS)
    return {**DEFAULT_SYNC_STATUS, **status}


def update_sync_status(store: RemoteStore, **updates: Any) -> dict[str, Any]:
    """Merge updates into the persisted sync status and save.

    Args:
        store: The backing data store.
        **updates: Key/value pairs to merge into the current status.

    Returns:
        The full updated sync-status dict after persisting.
    """
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
    """Create and persist a new audit-log event.

    Args:
        store: The backing data store.
        action: Short action identifier (e.g. ``"assign"``, ``"reset"``).
        message: Human-readable description of the event.
        actor_role: Role of the actor that triggered the event.
        actor_department: Department of the actor, if applicable.
        entity_type: Type of the affected entity (e.g. ``"room"``).
        entity_id: Identifier of the affected entity.
        details: Optional extra data to store as JSON.

    Returns:
        The newly created event row dict as written to the store.
    """
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
    """Return the most recent audit-log events in reverse chronological order.

    Args:
        store: The backing data store.
        limit: Maximum number of events to return.

    Returns:
        List of event dicts, newest first, with deserialized details.
    """
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
