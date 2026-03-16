"""Assign/unassign and person lookup endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from src.backend.access import person_visible_to_session, room_visible_to_department
from src.backend.auth_session import AuthSession, require_authenticated
from src.backend.dependencies import bump_version, core, get_data_version, mutation_lock, store
from src.backend.runtime_meta import append_audit_event
from src.backend.schemas import (
    AssignToRoomRequest,
    MoveRequest,
    SimpleOK,
    SwapRequest,
    UnassignRequest,
)

router = APIRouter()


def _assert_expected_version(expected_version: int | None) -> None:
    """Raise HTTP 409 if the client's expected version is stale.

    Args:
        expected_version: Data version the client last saw, or None to skip
            the check.

    Raises:
        HTTPException: 409 when the current server version differs from
            ``expected_version``.
    """
    if expected_version is None:
        return
    current_version = get_data_version()
    if int(expected_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail="הנתונים השתנו בינתיים. יש לרענן את המסך ולנסות שוב.",
        )


def _actor_department(session: AuthSession) -> str | None:
    """Extract the actor's department for audit logging.

    Args:
        session: The current authenticated session.

    Returns:
        The department name when the actor is a manager, otherwise None.
    """
    return session.department if session.role == "manager" else None


def _room_snapshot(building_name: str, room_number: int) -> dict | None:
    """Find a single room's current state by building and number.

    Args:
        building_name: Name of the building containing the room.
        room_number: The room number within the building.

    Returns:
        A dict of the room's current state, or None if not found.
    """
    rooms = core.rooms_with_state().to_dict(orient="records")
    for room in rooms:
        if str(room["building_name"]) == str(building_name) and int(room["room_number"]) == int(room_number):
            return room
    return None


@router.post("/unassign", response_model=SimpleOK)
def unassign(
    req: UnassignRequest,
    session: AuthSession = Depends(require_authenticated),
) -> SimpleOK:
    """Remove a person's room assignment.

    Args:
        req: Unassign request containing the person ID to remove.

    Returns:
        SimpleOK indicating whether the unassignment succeeded.
    """
    with mutation_lock():
        _assert_expected_version(req.expected_version)
        if session.role == "manager":
            person = store.get_by_id("personnel", str(req.person_id))
            if not person_visible_to_session(session, person):
                raise HTTPException(status_code=403, detail="אין הרשאה להסיר אדם מזירה אחרת")
        prev_room = core.get_person_room(str(req.person_id))
        ok = core.unassign(person_id=req.person_id)
        if ok:
            bump_version()
            store.delete("saved_assignments", req.person_id)
            prev_state = {"building_name": prev_room.building_name, "room_number": prev_room.room_number} if prev_room else None
            append_audit_event(
                store,
                actor_role=session.role,
                actor_department=_actor_department(session),
                action="unassign",
                entity_type="person",
                entity_id=req.person_id,
                message="אדם הוסר מהחדר",
                details={"previous_state": prev_state},
            )
    return SimpleOK(ok=ok, detail=None if ok else "המספר האישי אינו משובץ כרגע לחדר")


@router.post("/swap", response_model=SimpleOK)
def swap(
    req: SwapRequest,
    session: AuthSession = Depends(require_authenticated),
) -> SimpleOK:
    """Swap the room assignments of two people.

    Args:
        req: Swap request containing the two person IDs to swap.

    Returns:
        SimpleOK indicating whether the swap succeeded, with error detail on failure.
    """
    with mutation_lock():
        _assert_expected_version(req.expected_version)
        person_a = store.get_by_id("personnel", str(req.person_id_a))
        person_b = store.get_by_id("personnel", str(req.person_id_b))
        if not person_visible_to_session(session, person_a) or not person_visible_to_session(session, person_b):
            raise HTTPException(status_code=403, detail="אין הרשאה לבצע החלפה עבור הזירה שנבחרה")

        ok, err = core.swap_people(req.person_id_a, req.person_id_b)
        if ok:
            bump_version()
            append_audit_event(
                store,
                actor_role=session.role,
                actor_department=_actor_department(session),
                action="swap",
                entity_type="person",
                entity_id=f"{req.person_id_a},{req.person_id_b}",
                message="בוצעה החלפת חדרים",
                details={"person_id_a": req.person_id_a, "person_id_b": req.person_id_b},
            )
    return SimpleOK(ok=ok, detail=err)


@router.post("/move", response_model=SimpleOK)
def move(
    req: MoveRequest,
    session: AuthSession = Depends(require_authenticated),
) -> SimpleOK:
    """Move a person to a specific target room.

    Args:
        req: Move request containing the person ID and target room details.

    Returns:
        SimpleOK indicating whether the move succeeded, with error detail on failure.
    """
    with mutation_lock():
        _assert_expected_version(req.expected_version)
        person = store.get_by_id("personnel", str(req.person_id))
        if not person_visible_to_session(session, person):
            raise HTTPException(status_code=403, detail="אין הרשאה להעביר אדם מזירה אחרת")

        if session.role == "manager":
            target_room = _room_snapshot(req.target_building, req.target_room_number)
            if target_room is None or not room_visible_to_department(target_room, session.department or ""):
                raise HTTPException(status_code=403, detail="אין הרשאה להעביר לחדר יעד זה")

        prev_room = core.get_person_room(str(req.person_id))
        ok, err = core.move_person(req.person_id, req.target_building, req.target_room_number)
        if ok:
            bump_version()
            prev_state = {"building_name": prev_room.building_name, "room_number": prev_room.room_number} if prev_room else None
            append_audit_event(
                store,
                actor_role=session.role,
                actor_department=_actor_department(session),
                action="move",
                entity_type="person",
                entity_id=req.person_id,
                message="בוצעה העברה בין חדרים",
                details={
                    "target_building": req.target_building,
                    "target_room_number": req.target_room_number,
                    "previous_state": prev_state,
                },
            )
    return SimpleOK(ok=ok, detail=err)


@router.post("/assign-to-room", response_model=SimpleOK)
def assign_to_room(
    req: AssignToRoomRequest,
    session: AuthSession = Depends(require_authenticated),
) -> SimpleOK:
    """Assign an unassigned person to a specific room.

    Args:
        req: Request containing person ID, building name, and room number.

    Returns:
        SimpleOK indicating whether the assignment succeeded, with error
        detail on failure.
    """
    with mutation_lock():
        _assert_expected_version(req.expected_version)
        person = store.get_by_id("personnel", str(req.person_id))
        if not person_visible_to_session(session, person):
            raise HTTPException(status_code=403, detail="אין הרשאה לשבץ אדם מזירה אחרת")

        if session.role == "manager":
            target_room = _room_snapshot(req.building_name, req.room_number)
            if target_room is None or not room_visible_to_department(target_room, session.department or ""):
                raise HTTPException(status_code=403, detail="אין הרשאה לשבץ לחדר יעד זה")

        ok, err = core.assign_person_to_room(req.person_id, req.building_name, req.room_number)
        if ok:
            bump_version()
            append_audit_event(
                store,
                actor_role=session.role,
                actor_department=_actor_department(session),
                action="assign_to_room",
                entity_type="person",
                entity_id=req.person_id,
                message="אדם שובץ ידנית לחדר",
                details={
                    "building_name": req.building_name,
                    "room_number": req.room_number,
                    "previous_state": {"was_unassigned": True},
                },
            )
    return SimpleOK(ok=ok, detail=err)
