FROM node:22-slim AS base

# System deps for Playwright/Chromium + tini for proper PID-1 signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: dependencies (cached unless package*.json changes)
COPY package.json package-lock.json* ./
# Use `npm ci` when a lockfile is present (deterministic), else fall back.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
    else npm install --omit=dev --no-audit --no-fund; fi

# Tell Playwright to use the system Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=4747 \
    HOST=0.0.0.0

# Layer 2: app source
COPY . .

EXPOSE 4747

# Pure-Node healthcheck — no wget/curl needed, uses what's already in the image.
# Reads /api/health and exits non-zero on failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4747)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombie processes (Playwright spawns Chromium subprocesses)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default: launch the dashboard. Override with `docker run ... bash` for shell.
CMD ["node", "dashboard-web/server.mjs"]

LABEL org.opencontainers.image.source="https://github.com/santifer/career-ops" \
      org.opencontainers.image.description="JobSeeker · Career-Ops AI job-search dashboard" \
      org.opencontainers.image.licenses="MIT"
