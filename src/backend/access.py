"""Role-based visibility and scope helpers."""

from __future__ import annotations

from typing import Any

from src.backend.auth_session import AuthSession


def room_visible_to_department(room: dict[str, Any], department: str) -> bool:
    designated = str(room.get("designated_department") or "").strip()
    departments = [
        str(value).strip()
        for value in room.get("departments") or []
        if str(value).strip()
    ]

    if designated == department:
        return True
    if department in departments:
        return True
    if designated:
        return False
    if not departments:
        return True
    return False


def filter_rooms_for_session(
    session: AuthSession,
    rooms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if session.role == "admin":
        return rooms
    department = session.department or ""
    return [room for room in rooms if room_visible_to_department(room, department)]


def filter_personnel_for_session(
    session: AuthSession,
    personnel: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if session.role == "admin":
        return personnel
    department = session.department or ""
    return [
        person
        for person in personnel
        if str(person.get("department") or "").strip() == department
    ]


def person_visible_to_session(session: AuthSession, person: dict[str, Any] | None) -> bool:
    if person is None:
        return False
    if session.role == "admin":
        return True
    return str(person.get("department") or "").strip() == (session.department or "")
