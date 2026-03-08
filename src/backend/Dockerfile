# TripleZ Backend
# Build:  docker build -t triplez-api src/backend
# Run:    docker run -v triplez-data:/data -p 8000:8000 triplez-api
#
# Must be built from the repo root (for config.py):
#   docker build -f src/backend/Dockerfile -t triplez-api .

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
COPY src/backend/ src/backend/

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
