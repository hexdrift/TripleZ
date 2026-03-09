# TripleZ Frontend (static export served by Node)
# Build:  docker build -f src/frontend/Dockerfile -t triplez-web .
# Run:    docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://backend:8000/api triplez-web
#
# Must be built from the repo root (for scripts/inline-css.mjs).
# Set NEXT_PUBLIC_API_URL to the backend API base URL at build time.

# ── Stage 1: Build static export ──
FROM node:20-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL=http://backend:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY src/frontend/package.json src/frontend/package-lock.json* ./
RUN npm ci

COPY src/frontend/ .
# npm run build calls: next build && node ../../scripts/inline-css.mjs
COPY scripts/inline-css.mjs /scripts/inline-css.mjs
RUN OUT_DIR=/app/out npm run build

# ── Stage 2: Serve static files ──
FROM node:20-alpine

RUN npm install -g serve

COPY --from=builder /app/out /app/out

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["serve", "-s", "/app/out", "-l", "3000"]
