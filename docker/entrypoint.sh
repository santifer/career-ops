#!/usr/bin/env bash
# careerops web GUI entrypoint
#
# Architecture:
#   browser  →  NPM (HTTPS)  →  auth-proxy (Node, :7681)  →  ttyd (:7682, loopback)  →  career-dashboard
#
# The auth proxy serves a designed login page at /login, validates credentials,
# signs a 30-day session cookie, and transparently proxies the authenticated
# session (HTTP + WebSocket) to ttyd on the private port 7682.
set -euo pipefail

: "${CAREEROPS_WEB_USER:?CAREEROPS_WEB_USER must be set}"
: "${CAREEROPS_WEB_PASS:?CAREEROPS_WEB_PASS must be set}"
: "${COOKIE_SECRET:?COOKIE_SECRET must be set (generate with: openssl rand -hex 32)}"

WORKSPACE="${CAREEROPS_WORKSPACE:-/workspace}"
AUTH_PORT="${AUTH_PROXY_PORT:-7681}"
TTYD_PORT="${TTYD_INTERNAL_PORT:-7682}"

if [[ ! -d "${WORKSPACE}" ]]; then
  echo "FATAL: workspace ${WORKSPACE} not mounted" >&2
  exit 1
fi

# Start ttyd on the private port, no Basic Auth (the auth proxy owns auth now).
# Origin check stays OFF (default) — NPM rewrites Host.
ttyd \
  -p "${TTYD_PORT}" \
  -i 127.0.0.1 \
  -W \
  -t titleFixed='career-ops' \
  -t 'theme={"background":"#1e1e2e","foreground":"#cdd6f4","cursor":"#fab387","selection":"#585b70"}' \
  -t fontSize=14 \
  /usr/local/bin/career-dashboard --path "${WORKSPACE}" &
TTYD_PID=$!

# Propagate termination to ttyd when the auth proxy exits.
trap 'kill -TERM "${TTYD_PID}" 2>/dev/null || true' EXIT SIGTERM SIGINT

export AUTH_PROXY_PORT="${AUTH_PORT}"
export TTYD_TARGET="http://127.0.0.1:${TTYD_PORT}"

# tini (PID 1) reaps zombies; if ttyd dies the auth proxy will start returning
# 502 on proxied paths, which is the right signal for an external healthcheck.
exec node /opt/auth/server.mjs
