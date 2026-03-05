"""Assign/unassign and person lookup endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from src.backend.dependencies import bump_version, core
from src.backend.schemas import (
    AssignRequest,
    AssignResponse,
    MoveRequest,
    RoomRefResponse,
    SimpleOK,
    SwapRequest,
    UnassignRequest,
)

router = APIRouter()


@router.post("/assign", response_model=AssignResponse)
def assign(req: AssignRequest) -> AssignResponse:
    """Assign a person to a room based on rank, department, and gender.

    Args:
        req: Assignment request containing person details and constraints.

    Returns:
        AssignResponse indicating success with room details, or failure with error info.
    """
    room_ref, err = core.assign(
        person_id=req.person_id, rank=req.rank, department=req.department,
        gender=req.gender, person_name=req.person_name,
    )
    if room_ref is None:
        return AssignResponse(assigned=False, error_code=err["error_code"], error_message=err["error_message"])

    bump_version()
    return AssignResponse(
        assigned=True,
        room=RoomRefResponse(
            building_name=str(room_ref.building_name),
            room_number=int(room_ref.room_number),
            room_rank_used=str(room_ref.room_rank_used),
        ),
    )


@router.post("/unassign", response_model=SimpleOK)
def unassign(req: UnassignRequest) -> SimpleOK:
    """Remove a person's room assignment.

    Args:
        req: Unassign request containing the person ID to remove.

    Returns:
        SimpleOK indicating whether the unassignment succeeded.
    """
    ok = core.unassign(person_id=req.person_id)
    if ok:
        bump_version()
    return SimpleOK(ok=ok, detail=None if ok else "person_id not assigned")


@router.get("/person/{person_id}", response_model=AssignResponse)
def get_person_room(person_id: str) -> AssignResponse:
    """Look up the room assignment for a given person.

    Args:
        person_id: Unique identifier of the person to look up.

    Returns:
        AssignResponse with room details if assigned, or assigned=False otherwise.
    """
    ref = core.get_person_room(person_id)
    if ref is None:
        return AssignResponse(assigned=False)
    return AssignResponse(
        assigned=True,
        room=RoomRefResponse(
            building_name=str(ref.building_name),
            room_number=int(ref.room_number),
            room_rank_used=str(ref.room_rank_used),
        ),
    )


@router.post("/swap", response_model=SimpleOK)
def swap(req: SwapRequest) -> SimpleOK:
    """Swap the room assignments of two people.

    Args:
        req: Swap request containing the two person IDs to swap.

    Returns:
        SimpleOK indicating whether the swap succeeded, with error detail on failure.
    """
    ok, err = core.swap_people(req.person_id_a, req.person_id_b)
    if ok:
        bump_version()
    return SimpleOK(ok=ok, detail=err)


@router.post("/move", response_model=SimpleOK)
def move(req: MoveRequest) -> SimpleOK:
    """Move a person to a specific target room.

    Args:
        req: Move request containing the person ID and target room details.

    Returns:
        SimpleOK indicating whether the move succeeded, with error detail on failure.
    """
    ok, err = core.move_person(req.person_id, req.target_building, req.target_room_number)
    if ok:
        bump_version()
    return SimpleOK(ok=ok, detail=err)
