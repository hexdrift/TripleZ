"""
Abstract remote document store interface.

── HOW TO SET UP ──────────────────────────────────────────────────────

1. Create two independent tables in your CRUD HTTP service
   (see TABLE_SCHEMAS below for columns and types):

   rooms      — PK: room_id  (String, e.g. "A__10")
   personnel  — PK: person_id (String)

   No joins, no foreign keys between tables.

2. Subclass RemoteStore and implement all 7 methods.
   Each method maps to one HTTP call — see docstrings for the HTTP
   equivalent (GET, POST, PATCH, DELETE).

   Example skeleton:

       import requests
       from src.backend.store.base import RemoteStore

       class MyHttpStore(RemoteStore):
           def __init__(self, base_url: str):
               self.base_url = base_url

           def get_all(self, table):
               return requests.get(f"{self.base_url}/{table}").json()

           def get_by_id(self, table, pk_value):
               r = requests.get(f"{self.base_url}/{table}/{pk_value}")
               return r.json() if r.status_code == 200 else None

           def query(self, table, filters):
               return requests.get(f"{self.base_url}/{table}", params=filters).json()

           def insert(self, table, row):
               requests.post(f"{self.base_url}/{table}", json=row)

           def update(self, table, pk_value, updates):
               requests.patch(f"{self.base_url}/{table}/{pk_value}", json=updates)

           def delete(self, table, pk_value):
               requests.delete(f"{self.base_url}/{table}/{pk_value}")

           def delete_all(self, table):
               requests.delete(f"{self.base_url}/{table}")

3. In main.py, replace the _create_store() placeholder with your class:

       store = MyHttpStore(base_url="https://your-service.com/api")

4. Start the server:

       uvicorn src.backend.main:app --host 0.0.0.0 --port 8000

5. Preload your rooms and personnel DataFrames via admin endpoints
   (see example.py for the full flow).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


TABLE_SCHEMAS: dict[str, dict] = {
    "rooms": {
        "pk": "room_id",
        "columns": {
            "room_id": "String",
            "building_name": "String",
            "room_number": "Integer",
            "number_of_beds": "Integer",
            "room_rank": "String",
            "gender": "String",
            "designated_department": "String (optional, empty string if not set)",
            "occupant_ids": "String (JSON array of person_id strings, e.g. '[\"9001\", \"9002\"]')",
        },
    },
    "personnel": {
        "pk": "person_id",
        "columns": {
            "person_id": "String",
            "full_name": "String",
            "department": "String",
            "gender": "String",
            "rank": "String",
        },
    },
}


class RemoteStore(ABC):
    """
    Abstract interface for your remote CRUD service.

    Each table is independent — no joins, no foreign keys.
    Each table has a single primary key.
    All data is passed as plain dicts.
    """

    @abstractmethod
    def get_all(self, table: str) -> list[dict]:
        """
        Fetch every row in the table.

        HTTP equivalent: GET /{table}

        Args:
            table: "rooms" or "personnel"

        Returns:
            All rows as list of dicts. Empty list if table has no rows.
        """

    @abstractmethod
    def get_by_id(self, table: str, pk_value: Any) -> Optional[dict]:
        """
        Fetch a single row by its primary key.

        HTTP equivalent: GET /{table}/{pk_value}

        Args:
            table: "rooms" or "personnel"
            pk_value: Primary key value (room_id string or person_id string).

        Returns:
            Row dict or None if not found.
        """

    @abstractmethod
    def query(self, table: str, filters: dict) -> list[dict]:
        """
        Fetch rows matching ALL filter conditions (AND logic).

        HTTP equivalent: GET /{table}?field1=value1&field2=value2

        Args:
            table: "rooms" or "personnel"
            filters: Dict of {column: value} equality filters.
                     Example: {"room_rank": "VP", "gender": "M"}

        Returns:
            Matching rows as list of dicts. Empty list if no matches.
        """

    @abstractmethod
    def insert(self, table: str, row: dict) -> None:
        """
        Insert a new row. The row dict includes the primary key.

        HTTP equivalent: POST /{table} with body = row dict

        Args:
            table: "rooms" or "personnel"
            row: Dict of column values (must include primary key).
        """

    @abstractmethod
    def update(self, table: str, pk_value: Any, updates: dict) -> None:
        """
        Update specific fields on an existing row.

        HTTP equivalent: PATCH /{table}/{pk_value} with body = updates dict

        Args:
            table: "rooms" or "personnel"
            pk_value: Primary key value of row to update.
            updates: Dict of {column: new_value} to set. Only listed fields change.
        """

    @abstractmethod
    def delete(self, table: str, pk_value: Any) -> None:
        """
        Delete a single row by primary key.

        HTTP equivalent: DELETE /{table}/{pk_value}

        Args:
            table: "rooms" or "personnel"
            pk_value: Primary key value of row to delete.
        """

    @abstractmethod
    def delete_all(self, table: str) -> None:
        """
        Delete all rows in the table.

        HTTP equivalent: DELETE /{table} (or POST /{table}/clear)

        Args:
            table: "rooms" or "personnel"
        """
