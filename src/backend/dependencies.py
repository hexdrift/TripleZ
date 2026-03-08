"""Shared dependencies: store, allocator core, and data versioning."""

from __future__ import annotations

import os

from src.backend.settings import get_default_database_url, get_ranks_high_to_low

_data_version = 0


def _create_store():
    """Return the RemoteStore implementation based on STORE_BACKEND env var."""
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


class _LazyCore:
    """Proxy that defers pandas/allocator import until first use."""

    _instance = None

    def _ensure(self):
        if self._instance is None:
            from src.backend.services.allocator import RoomAllocatorCore
            from src.backend.services.rank_policy import RankPolicy
            self._instance = RoomAllocatorCore(
                store, rank_policy=RankPolicy(get_ranks_high_to_low())
            )

    def __getattr__(self, name):
        self._ensure()
        return getattr(self._instance, name)

    def __setattr__(self, name, value):
        if name == "_instance":
            super().__setattr__(name, value)
        else:
            self._ensure()
            setattr(self._instance, name, value)


core = _LazyCore()


def reload_runtime_settings() -> None:
    """Refresh runtime policy objects after settings changes."""
    from src.backend.services.rank_policy import RankPolicy
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


def mutation_lock():
    """Return the core's reentrant mutation lock.

    Use as a context manager around version checks + core calls to prevent
    TOCTOU races:

        with mutation_lock():
            assert_expected_version(req.expected_version)
            core.some_mutation(...)
    """
    return core._mutation_lock
