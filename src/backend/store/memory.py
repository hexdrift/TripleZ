"""In-memory implementation of RemoteStore for local development."""

from __future__ import annotations

from typing import Any, Optional

from src.backend.store.base import RemoteStore


class MemoryStore(RemoteStore):
    """In-memory implementation of RemoteStore using nested dicts."""

    def __init__(self) -> None:
        """Initialize empty rooms and personnel tables."""
        self._tables: dict[str, dict[str, dict]] = {
            "rooms": {},
            "personnel": {},
        }
        self._pks = {"rooms": "room_id", "personnel": "person_id"}

    def get_all(self, table: str) -> list[dict]:
        """Return all rows in the given table.

        Args:
            table: Table name.

        Returns:
            List of all row dicts.
        """
        return list(self._tables[table].values())

    def get_by_id(self, table: str, pk_value: Any) -> Optional[dict]:
        """Return a single row by primary key.

        Args:
            table: Table name.
            pk_value: Primary key value.

        Returns:
            Row dict or None if not found.
        """
        return self._tables[table].get(str(pk_value))

    def query(self, table: str, filters: dict) -> list[dict]:
        """Return rows matching all filter conditions.

        Args:
            table: Table name.
            filters: Dict of column-value equality conditions.

        Returns:
            List of matching row dicts.
        """
        results = []
        for row in self._tables[table].values():
            if all(row.get(k) == v for k, v in filters.items()):
                results.append(row)
        return results

    def insert(self, table: str, row: dict) -> None:
        """Insert a row into the table.

        Args:
            table: Table name.
            row: Dict containing the row data including primary key.
        """
        pk = self._pks[table]
        self._tables[table][str(row[pk])] = dict(row)

    def update(self, table: str, pk_value: Any, updates: dict) -> None:
        """Update fields on an existing row.

        Args:
            table: Table name.
            pk_value: Primary key of the row to update.
            updates: Dict of fields to update.
        """
        key = str(pk_value)
        if key in self._tables[table]:
            self._tables[table][key].update(updates)

    def delete(self, table: str, pk_value: Any) -> None:
        """Delete a single row by primary key.

        Args:
            table: Table name.
            pk_value: Primary key of the row to delete.
        """
        self._tables[table].pop(str(pk_value), None)

    def delete_all(self, table: str) -> None:
        """Delete all rows in the table.

        Args:
            table: Table name.
        """
        self._tables[table].clear()
