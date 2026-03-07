# Stage 1: Build the Next.js frontend as static files
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

ENV NEXT_TELEMETRY_DISABLED=1

COPY src/frontend/package.json src/frontend/package-lock.json* ./
RUN npm ci

COPY src/frontend/ .
RUN npm run build

# Stage 2: Python backend + static frontend
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV STORE_BACKEND=sqlalchemy
ENV TRIPLEZ_DATA_DIR=/data
ENV DATABASE_URL=sqlite:////data/triplez.db

COPY src/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py .
COPY src/ src/
COPY --from=frontend-builder /app/frontend/out src/frontend/out

RUN mkdir -p /data

VOLUME ["/data"]

EXPOSE 8000

CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
