"""Persistence helpers for runtime metadata and audit events."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from src.backend.store.base import RemoteStore
from src.backend.settings import load_settings, save_settings

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


MAX_AUDIT_ENTRIES = 500


def save_audit_snapshot(
    store: RemoteStore,
    event_id: str,
    table_names: list[str],
) -> str:
    """Snapshot one or more tables and link them to an audit event.

    Returns the snapshot_id prefix used for all rows.
    """
    sid = uuid.uuid4().hex
    for tname in table_names:
        if tname == "settings":
            data = load_settings()
        else:
            data = store.get_all(tname)
        store.insert(
            "audit_snapshots",
            {
                "snapshot_id": f"{sid}__{tname}",
                "event_id": event_id,
                "table_name": tname,
                "data": json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            },
        )
    return sid


def restore_audit_snapshot(store: RemoteStore, event_id: str) -> bool:
    """Restore tables from a snapshot linked to an audit event.

    Returns True if any snapshot rows were found and restored.
    """
    all_snaps = [
        s for s in store.get_all("audit_snapshots")
        if s.get("event_id") == event_id
    ]
    if not all_snaps:
        return False
    for snap in all_snaps:
        tname = snap["table_name"]
        data_raw = snap.get("data", "[]")
        data = json.loads(data_raw) if isinstance(data_raw, str) else data_raw
        if tname == "settings":
            # Restore settings file
            if isinstance(data, dict):
                save_settings(data)
        else:
            # Wipe current table and re-insert snapshot rows
            for existing in store.get_all(tname):
                pk = _table_pk(tname, existing)
                if pk is not None:
                    store.delete(tname, pk)
            for row in data:
                store.insert(tname, row)
    return True


def delete_audit_snapshots(store: RemoteStore, event_id: str) -> None:
    """Remove all snapshot rows linked to an audit event."""
    for snap in store.get_all("audit_snapshots"):
        if snap.get("event_id") == event_id:
            store.delete("audit_snapshots", snap["snapshot_id"])


def prune_audit_log(store: RemoteStore, max_entries: int = MAX_AUDIT_ENTRIES) -> int:
    """Auto-prune oldest audit entries (and their snapshots) beyond max_entries.

    Returns the number of entries pruned.
    """
    rows = sorted(
        store.get_all("audit_log"),
        key=lambda r: str(r.get("created_at", "")),
        reverse=True,
    )
    pruned = 0
    for row in rows[max_entries:]:
        eid = str(row.get("event_id", ""))
        delete_audit_snapshots(store, eid)
        store.delete("audit_log", eid)
        pruned += 1
    return pruned


def _table_pk(table_name: str, row: dict) -> str | None:
    """Return the primary key value for a row given its table name."""
    pk_map = {
        "rooms": "room_id",
        "personnel": "person_id",
        "saved_assignments": "person_id",
        "audit_log": "event_id",
        "audit_snapshots": "snapshot_id",
        "app_meta": "key",
    }
    pk_col = pk_map.get(table_name)
    if pk_col and pk_col in row:
        return str(row[pk_col])
    return None


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
