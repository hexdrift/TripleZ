"""Room query and streaming endpoints."""

from __future__ import annotations

import asyncio
import json
from typing import List

from fastapi import APIRouter, Depends, Request
from starlette.responses import StreamingResponse

from src.backend.access import filter_rooms_for_session
from src.backend.auth_session import AuthSession, require_authenticated
from src.backend.dependencies import core, get_data_version

router = APIRouter()


@router.get("/stream/rooms")
async def stream_rooms(
    request: Request,
    session: AuthSession = Depends(require_authenticated),
) -> StreamingResponse:
    """Stream room data as Server-Sent Events, pushing updates on change.

    Args:
        request: The incoming HTTP request, used to detect client disconnect.

    Returns:
        A StreamingResponse emitting SSE frames with JSON-encoded room data.
    """
    async def event_generator() -> None:
        """Async generator that yields SSE data frames when room data version changes.

        Returns:
            Yields SSE-formatted strings containing JSON room data.
        """
        last_version = -1
        while True:
            if await request.is_disconnected():
                break
            current = get_data_version()
            if current != last_version:
                last_version = current
                rooms = filter_rooms_for_session(
                    session,
                    core.rooms_with_state().to_dict(orient="records"),
                )
                payload = {"version": current, "rooms": rooms}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/rooms")
def get_rooms(session: AuthSession = Depends(require_authenticated)) -> List[dict]:
    """Return all rooms with dynamically computed available beds.

    Returns:
        A list of dicts, each representing a room with its current state.
    """
    return filter_rooms_for_session(
        session,
        core.rooms_with_state().to_dict(orient="records"),
    )


@router.get("/links")
def get_links(session: AuthSession = Depends(require_authenticated)) -> List[dict]:
    """Return person-to-room identity mappings.

    Returns:
        A list of dicts mapping person IDs to their assigned rooms.
    """
    visible_rooms = filter_rooms_for_session(
        session,
        core.rooms_with_state().to_dict(orient="records"),
    )
    visible_ids = {
        (str(room["building_name"]), int(room["room_number"]))
        for room in visible_rooms
    }
    links = [
        row
        for row in core.links_df().to_dict(orient="records")
        if (str(row["building_name"]), int(row["room_number"])) in visible_ids
    ]
    return links

