# Triple Z — Room Allocation System

Real-time room and bed allocation system with a Hebrew RTL interface. Manages buildings, rooms, and personnel assignments with live sync across clients. Built with FastAPI and Next.js.

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

**Single pod** (backend + frontend in one container):
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
