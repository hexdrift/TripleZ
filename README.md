# Triple Z — Room Allocation System

Real-time room and bed allocation system with a Hebrew RTL interface. Manages buildings, rooms, and personnel assignments with live sync across clients.

## Features

- **Room & Bed Management** — Bulk load rooms, track capacity and occupancy, assign gender and rank constraints, designate departments per room
- **Personnel Management** — Import/create personnel with ID, name, rank, gender, and department; search and filter across all fields
- **Auto-Assignment** — Rank-based and department-first allocation algorithms with configurable bed reservation policies
- **Real-Time Sync** — Server-Sent Events push room changes to all connected clients with optimistic locking
- **Role-Based Access** — Admin (full access) and department manager (scoped to own department) roles with session-based auth
- **Excel Import/Export** — Bilingual Hebrew/English headers; exported files can be re-uploaded directly
- **Audit Log** — Immutable trail of all mutations with actor, action, entity, and timestamp
- **Background Sync** — Configurable polling of an external personnel source with automatic reconciliation
- **Setup Packages** — Export/import full configuration snapshots for backup or migration

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.11, FastAPI, SQLAlchemy, Pandas, SSE-Starlette |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Radix UI, shadcn/ui |
| Database | SQLite (via SQLAlchemy) |
| Deployment | Docker (single or multi-pod), PyInstaller standalone executables |

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

Run `triplez-api` on port 8000 and `triplez-web` on port 80. The frontend nginx config proxies `/api/` to the backend service.

### Standalone Executable

macOS:
```bash
./scripts/build.sh
```

Windows:
```bat
build.bat
```

Output goes to `dist/`. The executable bundles backend, frontend, and a browser launcher into a single file.

## Project Structure

```
src/
  backend/
    routers/        # API endpoints (auth, rooms, personnel, assignment, admin, settings)
    services/       # Core allocation logic and rank policy
    store/          # Data layer (SQLite via SQLAlchemy, in-memory for dev)
    schemas.py      # Pydantic models
    main.py         # FastAPI app entry point
  frontend/
    src/app/        # Next.js pages (dashboard, rooms, buildings, personnel, audit, settings)
    src/components/ # React components (modals, sidebar, cards, analytics)
    src/lib/        # API client, Excel parsing, Hebrew utilities, types
config.py           # Shared configuration and normalization helpers
scripts/            # Build scripts (PyInstaller spec, CSS inliner, app bundle)
Dockerfile          # Multi-stage build (Python 3.11 + Node 20)
```

## Configuration

Settings are managed via the admin settings page or `triplez_settings.json`:

- **Ranks** — Ordered high-to-low for allocation priority
- **Departments / Buildings / Genders** — Allowed values for rooms and personnel
- **Personnel Sync** — External URL, polling interval, pause toggle
- **Auto-Assign Policy** — `department_first` or `rank_only`
- **Bed Reservation** — `reserve` (hold beds for designated dept) or `best_effort`
- **Passwords** — Separate admin and per-department manager passwords

## API

All endpoints are under `/api`. Key groups:

| Route | Description |
|-------|-------------|
| `POST /api/auth/login` | Authenticate and receive session cookie |
| `GET /api/rooms` | List all rooms with computed availability |
| `GET /api/stream/rooms` | SSE stream of room state changes |
| `GET /api/personnel` | List all personnel |
| `POST /api/assign-to-room` | Assign a person to a room |
| `POST /api/admin/upload_rooms` | Upload rooms Excel file |
| `POST /api/admin/upload_personnel` | Upload personnel Excel file |
| `POST /api/admin/auto_assign` | Run auto-assignment algorithm |
| `GET /api/admin/audit-log` | View audit trail |
| `GET /api/health` | Health check |
