"""
FastAPI room allocator backed by a remote document store.

Rooms store occupant_ids (JSON array of person_id strings).
Personnel stores person details (name, rank, department, gender).
Available beds computed dynamically: number_of_beds - len(occupant_ids).

Typical flow:
  1. Load rooms via POST /admin/load_rooms  (pre-filled with occupant_ids)
  2. Load personnel via POST /admin/load_personnel
  3. Assign unplaced people via POST /admin/auto_assign
  4. Fine-tune placements via POST /assign-to-room, /move, and /swap

Setup:
  pip install fastapi uvicorn pandas pydantic
  uvicorn src.backend.main:app --reload

See src/backend/store/base.py for how to implement your store.
See example.py for preloading DataFrames and all available API calls.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse

from src.backend.dependencies import bump_version, core
from src.backend.routers import admin, assignment, auth, personnel, rooms, settings
from src.backend.routers.admin import run_personnel_sync_from_configured_source
from src.backend.settings import (
    get_personnel_sync_interval_seconds,
    is_personnel_sync_paused,
    load_settings,
)
from src.backend.schemas import SimpleOK

app = FastAPI(title="Room Allocator API", version="1.0")
logger = logging.getLogger(__name__)


def _cors_allowed_origins() -> list[str]:
    """Return explicit origins for cookie-based auth in local/dev environments."""
    raw = os.environ.get("TRIPLEZ_CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]

    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


def _personnel_sync_interval_seconds() -> int:
    raw = os.environ.get("TRIPLEZ_PERSONNEL_SYNC_INTERVAL_SECONDS", "").strip()
    if raw:
        try:
            value = int(raw)
        except ValueError:
            value = 30
        return max(15, value)
    return get_personnel_sync_interval_seconds()


async def _personnel_sync_loop() -> None:
    while True:
        try:
            settings_payload = load_settings()
            personnel_url = str(settings_payload.get("personnel_url", "")).strip()
            if personnel_url and not is_personnel_sync_paused():
                result = await asyncio.to_thread(
                    run_personnel_sync_from_configured_source,
                    personnel_url,
                    trigger="background",
                    actor_role="system",
                    actor_department=None,
                )
                if result.get("changed") or result.get("room_state_changed"):
                    bump_version()
                if result.get("changed"):
                    logger.info(
                        "Personnel sync applied: count=%s room_state_changed=%s",
                        result.get("count"),
                        result.get("room_state_changed"),
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Background personnel sync failed")

        await asyncio.sleep(_personnel_sync_interval_seconds())


@app.on_event("startup")
async def reconcile_runtime_state_on_startup() -> None:
    """Repair legacy/inconsistent persisted data when the service starts."""
    report = core.reconcile_runtime_state()
    if report.get("has_changes"):
        bump_version()
    app.state.personnel_sync_task = asyncio.create_task(_personnel_sync_loop())


@app.on_event("shutdown")
async def stop_background_tasks() -> None:
    task = getattr(app.state, "personnel_sync_task", None)
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@app.get("/health", response_model=SimpleOK)
def health() -> SimpleOK:
    """Check API liveness.

    Returns:
        SimpleOK: An object with ``ok=True`` indicating the service is up.
    """
    return SimpleOK(ok=True)


API_PREFIX = "/api"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(rooms.router, prefix=API_PREFIX)
app.include_router(personnel.router, prefix=API_PREFIX)
app.include_router(assignment.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(settings.router, prefix=API_PREFIX)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "out"


def _static_headers(path: Path) -> dict[str, str]:
    path_str = path.as_posix()
    if "/_next/static/" in path_str:
        return {"Cache-Control": "public, max-age=31536000, immutable"}
    return {"Cache-Control": "public, max-age=3600"}


def _is_static_asset_path(path: str) -> bool:
    normalized = path.strip("/")
    if not normalized:
        return False
    if normalized.startswith("_next/") or normalized.startswith("media/"):
        return True
    return bool(Path(normalized).suffix)

if FRONTEND_DIR.is_dir():
    @app.api_route("/media/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_media_alias(path: str):
        """Serve exported font/media assets referenced from inlined CSS."""
        file = FRONTEND_DIR / "_next" / "static" / "media" / path
        if file.is_file():
            return FileResponse(file, headers=_static_headers(file))
        raise HTTPException(status_code=404, detail="לא נמצא")

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_root():
        """Serve the root index.html."""
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_frontend(path: str):
        """Serve the static Next.js frontend, falling back to index.html for client-side routing."""
        file = FRONTEND_DIR / path
        if file.is_file():
            return FileResponse(file, headers=_static_headers(file))
        page_html = FRONTEND_DIR / path / "index.html"
        if page_html.is_file():
            return FileResponse(page_html, headers={"Cache-Control": "no-cache"})
        if _is_static_asset_path(path):
            raise HTTPException(status_code=404, detail="לא נמצא")
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    uvicorn.run("src.backend.main:app", host="0.0.0.0", port=8000, reload=True)
