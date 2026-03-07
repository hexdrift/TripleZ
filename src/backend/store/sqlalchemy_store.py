"""SQLAlchemy implementation of RemoteStore.

Supports any database SQLAlchemy can connect to (SQLite, PostgreSQL, MySQL, etc.).
Configure via DATABASE_URL environment variable.

Examples:
    sqlite:///data.db
    sqlite:////:memory:
    postgresql://user:pass@host:5432/dbname
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.backend.store.base import RemoteStore


def _build_tables(metadata: MetaData) -> dict[str, Table]:
    """Define the rooms and personnel tables."""
    rooms = Table(
        "rooms",
        metadata,
        Column("room_id", String, primary_key=True),
        Column("building_name", String, nullable=False),
        Column("room_number", Integer, nullable=False),
        Column("number_of_beds", Integer, nullable=False),
        Column("room_rank", String, nullable=False),
        Column("gender", String, nullable=False),
        Column("designated_department", String, nullable=False, server_default=""),
        Column("occupant_ids", String, nullable=False, server_default="[]"),
    )

    personnel = Table(
        "personnel",
        metadata,
        Column("person_id", String, primary_key=True),
        Column("full_name", String, nullable=False),
        Column("department", String, nullable=False),
        Column("gender", String, nullable=False),
        Column("rank", String, nullable=False),
    )

    app_meta = Table(
        "app_meta",
        metadata,
        Column("key", String, primary_key=True),
        Column("value", Text, nullable=False, server_default="{}"),
    )

    audit_log = Table(
        "audit_log",
        metadata,
        Column("event_id", String, primary_key=True),
        Column("created_at", String, nullable=False),
        Column("actor_role", String, nullable=False, server_default="system"),
        Column("actor_department", String, nullable=False, server_default=""),
        Column("action", String, nullable=False),
        Column("entity_type", String, nullable=False, server_default=""),
        Column("entity_id", String, nullable=False, server_default=""),
        Column("message", Text, nullable=False),
        Column("details", Text, nullable=False, server_default="{}"),
    )

    return {
        "rooms": rooms,
        "personnel": personnel,
        "app_meta": app_meta,
        "audit_log": audit_log,
    }


class SQLAlchemyStore(RemoteStore):
    """SQLAlchemy-backed implementation of RemoteStore."""

    def __init__(self, database_url: str) -> None:
        engine_kwargs = {"echo": False}
        if database_url.startswith("sqlite:"):
            engine_kwargs["connect_args"] = {"check_same_thread": False}

        self._engine = create_engine(database_url, **engine_kwargs)
        self._metadata = MetaData()
        self._tables = _build_tables(self._metadata)
        self._metadata.create_all(self._engine)
        self._Session = sessionmaker(bind=self._engine)
        self._pks = {
            "rooms": "room_id",
            "personnel": "person_id",
            "app_meta": "key",
            "audit_log": "event_id",
        }

    def _session(self) -> Session:
        return self._Session()

    def get_all(self, table: str) -> list[dict]:
        tbl = self._tables[table]
        with self._session() as session:
            rows = session.execute(tbl.select()).mappings().all()
            return [dict(r) for r in rows]

    def get_by_id(self, table: str, pk_value: Any) -> Optional[dict]:
        tbl = self._tables[table]
        pk_col = tbl.c[self._pks[table]]
        with self._session() as session:
            row = session.execute(
                tbl.select().where(pk_col == str(pk_value))
            ).mappings().first()
            return dict(row) if row else None

    def query(self, table: str, filters: dict) -> list[dict]:
        tbl = self._tables[table]
        stmt = tbl.select()
        for col_name, value in filters.items():
            stmt = stmt.where(tbl.c[col_name] == value)
        with self._session() as session:
            rows = session.execute(stmt).mappings().all()
            return [dict(r) for r in rows]

    def insert(self, table: str, row: dict) -> None:
        tbl = self._tables[table]
        with self._session() as session:
            session.execute(tbl.insert().values(**row))
            session.commit()

    def update(self, table: str, pk_value: Any, updates: dict) -> None:
        tbl = self._tables[table]
        pk_col = tbl.c[self._pks[table]]
        with self._session() as session:
            session.execute(
                tbl.update().where(pk_col == str(pk_value)).values(**updates)
            )
            session.commit()

    def delete(self, table: str, pk_value: Any) -> None:
        tbl = self._tables[table]
        pk_col = tbl.c[self._pks[table]]
        with self._session() as session:
            session.execute(tbl.delete().where(pk_col == str(pk_value)))
            session.commit()

    def delete_all(self, table: str) -> None:
        tbl = self._tables[table]
        with self._session() as session:
            session.execute(tbl.delete())
            session.commit()

    def bulk_update(self, table: str, updates: list[tuple[Any, dict]]) -> None:
        tbl = self._tables[table]
        pk_col = tbl.c[self._pks[table]]
        with self._session() as session:
            for pk_value, row_updates in updates:
                session.execute(
                    tbl.update().where(pk_col == str(pk_value)).values(**row_updates)
                )
            session.commit()
