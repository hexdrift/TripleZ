# TripleZ Frontend (nginx + static export)
# Build:  docker build -t triplez-web src/frontend
# Run:    docker run -p 80:80 triplez-web
#
# Must be built from the repo root (for scripts/inline-css.mjs):
#   docker build -f src/frontend/Dockerfile -t triplez-web .
#
# Set BACKEND_URL via nginx env or override nginx.conf for your backend host.

# ── Stage 1: Build static export ──
FROM node:20-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY src/frontend/package.json src/frontend/package-lock.json* ./
RUN npm ci

COPY src/frontend/ .
# npm run build calls: next build && node ../../scripts/inline-css.mjs
COPY scripts/inline-css.mjs /scripts/inline-css.mjs
RUN npm run build

# ── Stage 2: Serve with nginx ──
FROM nginx:stable-alpine

COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
