# Triple Z — Room Allocation System

Real-time room allocation and bed management system with a Hebrew RTL interface. Built with FastAPI (Python) and Next.js (React).

## Features

- **Dashboard** — overview of buildings, departments, genders, and ranks with occupancy stats
- **Room management** — add rooms, upload via CSV/Excel, assign/unassign personnel
- **Personnel management** — load from URL or Excel upload, view all assigned personnel
- **Real-time updates** — SSE-based live sync across all connected clients
- **Multi-view** — switch between building, department, gender, and rank views
- **Swap & move** — swap two people or move someone to a different room
- **Settings** — configure ranks, departments, genders, buildings, passwords, and Hebrew labels
- **Auth** — admin and per-department password-based access
- **Export** — export data to Excel from any view
- **Dark mode** — system-aware theme toggle

## Architecture

Single-process deployment: FastAPI serves both the API and the Next.js static export.

```
src/
├── backend/
│   ├── main.py              # FastAPI app, serves API + static frontend
│   ├── services/allocator.py # Core allocation logic
│   ├── store/               # Pluggable data store (SQLite default)
│   ├── routers/             # API routes (admin, assignment, auth, etc.)
│   ├── settings.py          # Persistent JSON settings
│   └── requirements.txt
└── frontend/
    ├── src/app/             # Next.js pages (dashboard, buildings, personnel, settings)
    ├── src/components/      # React components
    └── src/lib/             # API client, types, helpers
```

## Quick Start

### Development

```bash
# Backend
pip install -r src/backend/requirements.txt
uvicorn src.backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd src/frontend
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

Open http://localhost:3000. Default admin password: `admin123` (configurable in settings).
Development ports are fixed to:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000/api`

If you run on different ports, set:
- Frontend env `NEXT_PUBLIC_API_URL` (for example: `http://localhost:8100`)
- Backend env `TRIPLEZ_CORS_ORIGINS` as comma-separated origins (for example: `http://localhost:3000,http://localhost:3001`)

### Docker

```bash
docker build -t triplez .
docker run -p 8000:8000 triplez
```

Open http://localhost:8000.

### PyInstaller (standalone executable)

```bash
pip install pyinstaller
cd src/frontend && pnpm build && cd ../..
pyinstaller app.spec
```

The executable bundles both backend and frontend into a single file.

## Data Loading

1. **Rooms** — upload CSV/Excel from the dashboard ("הוספת חדר") or building detail page
2. **Personnel** — configure a URL in settings, or upload Excel manually from the settings page

### Expected Columns

| Column | Description |
|--------|-------------|
| `building_name` | Building identifier |
| `room_number` | Room number |
| `number_of_beds` | Bed count |
| `room_rank` | Room rank (must match configured ranks) |
| `gender` | Gender (must match configured genders) |
| `occupant_ids` | Comma-separated person IDs (optional) |

Personnel Excel: `person_id`, `full_name`, `department`, `gender`, `rank`.

## API

All endpoints are under `http://localhost:8000/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rooms` | List all rooms |
| GET | `/personnel` | List all personnel |
| POST | `/assign-to-room` | Manually assign a person to a specific room |
| POST | `/unassign` | Remove person from their room |
| POST | `/swap` | Swap two people |
| POST | `/move` | Move person to specific room |
| GET | `/stream/rooms` | SSE stream of room updates |
| POST | `/admin/load_rooms` | Replace all rooms |
| POST | `/admin/load_personnel` | Replace all personnel |
| POST | `/admin/load_personnel_from_url` | Load personnel from configured URL |
| POST | `/admin/auto_assign` | Automatically place unassigned personnel |
| GET/PUT | `/admin/settings` | Read/update settings |
| POST | `/auth/login` | Authenticate |
