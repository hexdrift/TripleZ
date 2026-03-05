"""
FastAPI room allocator backed by a remote document store.

Rooms store occupant_ids (JSON array of person_id strings).
Personnel stores person details (name, rank, department, gender).
Available beds computed dynamically: number_of_beds - len(occupant_ids).

Typical flow:
  1. Load rooms via POST /admin/load_rooms  (pre-filled with occupant_ids)
  2. Load personnel via POST /admin/load_personnel
  3. Assign arrivals via POST /assign  (person_id only if in personnel)

Setup:
  pip install fastapi uvicorn pandas pydantic
  uvicorn src.backend.main:app --reload

See src/backend/store/base.py for how to implement your store.
See example.py for preloading DataFrames and all available API calls.
"""

from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from src.backend.routers import admin, assignment, auth, personnel, rooms, settings
from src.backend.schemas import SimpleOK

app = FastAPI(title="Room Allocator API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=SimpleOK)
def health() -> SimpleOK:
    """Check API liveness.

    Returns:
        SimpleOK: An object with ``ok=True`` indicating the service is up.
    """
    return SimpleOK(ok=True)


app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(personnel.router)
app.include_router(assignment.router)
app.include_router(admin.router)
app.include_router(settings.router)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "out"

if FRONTEND_DIR.is_dir():
    @app.get("/", include_in_schema=False)
    async def serve_root():
        """Serve the root index.html."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str):
        """Serve the static Next.js frontend, falling back to index.html for client-side routing."""
        file = FRONTEND_DIR / path
        if file.is_file():
            return FileResponse(file)
        page_html = FRONTEND_DIR / path / "index.html"
        if page_html.is_file():
            return FileResponse(page_html)
        return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    uvicorn.run("src.backend.main:app", host="0.0.0.0", port=8000, reload=True)
