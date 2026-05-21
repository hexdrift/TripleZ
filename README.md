# Triple Z — Room Allocation System

Real-time room and bed allocation system with a Hebrew RTL interface. Manages buildings, rooms, and personnel assignments with live sync across clients.

Built with FastAPI (Python 3.11) and Next.js 16 (React 19, TypeScript, Tailwind v4). Data stored in SQLite, deployable as a single-pod Docker image, two-pod backend/frontend, or a standalone executable that bundles the entire stack into one file.

## Why

Existing room-management tools assume an English-first, web-only workflow with constant connectivity. Triple Z is built for environments where Hebrew is the primary language, the operator may be running it on a single laptop with no internet, and changes need to propagate to every connected client instantly — without page refreshes or polling.

## Features

- **Real-time sync** — assignment changes propagate live across all connected clients
- **Hebrew RTL interface** — first-class right-to-left layout, not an afterthought
- **Flexible deployment** — single-pod Docker, two-pod split, or self-contained standalone executable
- **Rank-aware allocation** — built-in rank/policy engine for assignment decisions
- **Excel import** — parse and ingest personnel rosters from spreadsheets
- **Audit trail** — every assignment change recorded and surfaced in the UI
- **Configurable settings** — admin panel for buildings, rooms, and allocation rules
- **Analytics dashboard** — occupancy, distribution, and assignment statistics at a glance

## Setup

### Development

```bash
# Backend
pip install -r src/backend/requirements.txt
uvicorn src.backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd src/frontend && npm install && npm run dev
```

Frontend: http://localhost:3000 | Backend API: http://localhost:8000/api
Default admin password: `admin123`

### Docker

**Single pod** (backend serves the frontend static export):
```bash
docker build -t triplez .
docker run -v triplez-data:/data -p 8000:8000 triplez
```

**Two pods** (separate backend and frontend):
```bash
docker build --target backend -t triplez-api .
docker build --target frontend -t triplez-web .
```

Run `triplez-api` on port 8000 and `triplez-web` on port 80. The frontend nginx config proxies `/api/` to the backend.

### Standalone Executable

```bash
# macOS
./scripts/build.sh

# Windows
build.bat
```

Output goes to `dist/`. Bundles backend, frontend, and a browser launcher into a single file — no Python or Node required on the target machine.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | FastAPI · Python 3.11 · SQLite · WebSockets |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind v4 |
| Build | Docker (multi-stage) · PyInstaller (standalone) |
| Internationalization | Hebrew RTL · custom RTL utilities |

## Architecture

```
┌──────────────────┐  WebSocket  ┌─────────────────┐
│ Next.js Frontend │ ◄─────────► │ FastAPI Backend │
│  (RTL, React 19) │    HTTP     │   (Routers)     │
└──────────────────┘             └────────┬────────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                       ┌──────▼──────┐         ┌──────▼──────┐
                       │   Services  │         │    Store    │
                       │ (allocation,│         │  (SQLite or │
                       │  rank/policy)│        │  in-memory) │
                       └─────────────┘         └─────────────┘
```

## Project Structure

```
src/
  backend/
    routers/        # API endpoints (auth, rooms, personnel, assignment, admin, settings)
    services/       # Allocation logic and rank policy
    store/          # Data layer (SQLite or in-memory)
  frontend/
    src/app/        # Pages (dashboard, rooms, buildings, personnel, audit, settings)
    src/components/ # Modals, sidebar, cards, analytics
    src/lib/        # API client, Excel parsing, Hebrew utilities
scripts/            # Build scripts (PyInstaller, CSS inliner)
Dockerfile          # Multi-stage build (Python 3.11 + Node 20)
```

## License

MIT.
