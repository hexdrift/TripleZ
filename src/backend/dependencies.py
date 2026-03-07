"""Shared dependencies: store, allocator core, and data versioning."""

from __future__ import annotations

import os

from src.backend.services.allocator import RoomAllocatorCore
from src.backend.services.rank_policy import RankPolicy
from src.backend.settings import get_default_database_url, get_ranks_high_to_low
from src.backend.store.base import RemoteStore

_data_version = 0


def _create_store() -> RemoteStore:
    """Return the RemoteStore implementation based on STORE_BACKEND env var.

    Supported values:
        memory      — in-memory dict store (data lost on restart)
        sqlalchemy  — SQLAlchemy-backed store (default, persisted to SQLite
                      unless DATABASE_URL is provided)

    Returns:
        A RemoteStore instance.
    """
    backend = os.environ.get("STORE_BACKEND", "sqlalchemy").lower()

    if backend == "sqlalchemy":
        database_url = os.environ.get("DATABASE_URL") or get_default_database_url()
        from src.backend.store.sqlalchemy_store import SQLAlchemyStore
        return SQLAlchemyStore(database_url)

    if backend == "memory":
        from src.backend.store.memory import MemoryStore
        return MemoryStore()

    raise RuntimeError(
        f"Unknown STORE_BACKEND='{backend}'. Supported: memory, sqlalchemy"
    )


store = _create_store()
rank_policy = RankPolicy(get_ranks_high_to_low())
core = RoomAllocatorCore(store, rank_policy=rank_policy)


def reload_runtime_settings() -> None:
    """Refresh runtime policy objects after settings changes."""
    ranks = get_ranks_high_to_low()
    core.rank_policy = RankPolicy(ranks)


def bump_version() -> None:
    """Increment the global data version counter."""
    global _data_version
    _data_version += 1


def get_data_version() -> int:
    """Return the current data version number.

    Returns:
        The current version as an integer.
    """
    return _data_version
