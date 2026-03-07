"""Role-based visibility and scope helpers."""

from __future__ import annotations

from typing import Any

from src.backend.auth_session import AuthSession


def room_visible_to_department(room: dict[str, Any], department: str) -> bool:
    """Check whether a room is visible to a given department.

    A room is visible if the department matches its designated department,
    appears in its departments list, or if the room has no department
    restrictions.

    Args:
        room: Room dict with optional ``designated_department`` and
            ``departments`` keys.
        department: Department name to check visibility for.

    Returns:
        True if the room should be visible to the department.
    """
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
    """Filter a list of rooms to only those visible to the current session.

    Admins see all rooms; department users see only rooms visible to their
    department.

    Args:
        session: The authenticated user session.
        rooms: Full list of room dicts to filter.

    Returns:
        Filtered list of room dicts the session is allowed to see.
    """
    if session.role == "admin":
        return rooms
    department = session.department or ""
    return [room for room in rooms if room_visible_to_department(room, department)]


def filter_personnel_for_session(
    session: AuthSession,
    personnel: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Filter a list of personnel to only those visible to the current session.

    Admins see all personnel; department users see only members of their own
    department.

    Args:
        session: The authenticated user session.
        personnel: Full list of person dicts to filter.

    Returns:
        Filtered list of person dicts the session is allowed to see.
    """
    if session.role == "admin":
        return personnel
    department = session.department or ""
    return [
        person
        for person in personnel
        if str(person.get("department") or "").strip() == department
    ]


def person_visible_to_session(session: AuthSession, person: dict[str, Any] | None) -> bool:
    """Check whether a person record is visible to the current session.

    Args:
        session: The authenticated user session.
        person: Person dict, or None if the person was not found.

    Returns:
        True if the session is allowed to view this person.
    """
    if person is None:
        return False
    if session.role == "admin":
        return True
    return str(person.get("department") or "").strip() == (session.department or "")
