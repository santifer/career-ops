# syntax=docker/dockerfile:1.7
#
# careerops-scraper — Scrapling sidecar.
# Heavier container (Python + Playwright/Camoufox browser bundles) so the
# main careerops container can stay lean. Talks HTTP on :8000 over the
# management network; only the auth proxy calls into it.

FROM python:3.12-slim-bookworm AS runtime

# System libs needed for headless chromium/firefox; Scrapling/Camoufox install
# their own browser bundles via `scrapling install` post-pip.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 \
      libcups2 libdbus-1-3 libpango-1.0-0 libcairo2 \
      libxshmfence1 libxrender1 libx11-xcb1 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Scrapling needs its browser bundles fetched into ~/.cache/ms-playwright and
# ~/.cache/camoufox. Doing this at build time bakes them into the image.
# Skip silently if the version's CLI shape differs; the fetcher falls back to
# the plain HTTP path.
RUN python -c "from scrapling.fetchers import Fetcher, StealthyFetcher, DynamicFetcher; print('scrapling import ok')"

# Bake browser bundles into the image. Without this, the first /scrape call
# tries to launch a non-existent chromium and the StealthyFetcher / Dynamic-
# Fetcher both fall back to the plain HTTP fetcher — which only sees static
# HTML and can't handle JS-rendered job pages (LinkedIn, Greenhouse, etc.).
#
# Patchright = patched Playwright (for DynamicFetcher).
# Camoufox    = patched Firefox build (for StealthyFetcher).
# Bundles go under a shared /opt/browsers cache so they're owned by root
# and readable by the runtime `app` user.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers \
    CAMOUFOX_HOME=/opt/browsers/camoufox

RUN mkdir -p /opt/browsers \
 && patchright install chromium \
 && chmod -R a+rX /opt/browsers

COPY scrape_server.py ./

# Non-root for sandbox-friendliness
ARG APP_UID=1001
ARG APP_GID=1001
RUN groupadd -g ${APP_GID} app && useradd -m -u ${APP_UID} -g ${APP_GID} -s /bin/bash app \
 && chown -R app:app /app
USER app

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-m", "uvicorn", "scrape_server:app", \
            "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
