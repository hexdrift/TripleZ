# Unified Dockerfile for TripleZ
# Build targets:
#   docker build -t triplez .                         → single pod (backend + frontend)
#   docker build --target backend -t triplez-api .    → backend only
#   docker build --target frontend -t triplez-web .   → frontend only (nginx)
#
# Single pod:
#   docker run -v triplez-data:/data -p 8000:8000 triplez
#
# Two pods:
#   docker run -v triplez-data:/data -p 8000:8000 triplez-api
#   docker run -p 80:80 triplez-web              (set BACKEND_URL to backend host)

# ── Stage 1: Build Next.js static export ──
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1

COPY src/frontend/package.json src/frontend/package-lock.json* ./
RUN npm ci

COPY src/frontend/ .
RUN npm run build

# ── Stage 2: Backend (also the default single-pod image) ──
FROM python:3.11-slim AS backend

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV STORE_BACKEND=sqlalchemy
ENV TRIPLEZ_DATA_DIR=/data
ENV DATABASE_URL=sqlite:////data/triplez.db

COPY src/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py .
COPY src/backend/ src/backend/
COPY --from=frontend-builder /app/frontend/out src/frontend/out

RUN mkdir -p /data && \
    addgroup --system triplez && \
    adduser --system --ingroup triplez triplez && \
    chown -R triplez:triplez /data

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

USER triplez

CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Stage 3: Frontend-only (nginx + static files) ──
FROM nginx:stable-alpine AS frontend

COPY --from=frontend-builder /app/frontend/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
