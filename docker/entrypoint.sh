#!/usr/bin/env bash
# career-ops web GUI entrypoint
# Exposes the Go TUI dashboard over the browser via ttyd, behind HTTP Basic Auth.
set -euo pipefail

: "${CAREEROPS_WEB_USER:?CAREEROPS_WEB_USER must be set (HTTP Basic Auth username)}"
: "${CAREEROPS_WEB_PASS:?CAREEROPS_WEB_PASS must be set (HTTP Basic Auth password)}"

WORKSPACE="${CAREEROPS_WORKSPACE:-/workspace}"
PORT="${CAREEROPS_WEB_PORT:-7681}"

if [[ ! -d "${WORKSPACE}" ]]; then
  echo "FATAL: workspace ${WORKSPACE} not mounted" >&2
  exit 1
fi

# ttyd flags:
#   -p   listen port
#   -i   bind address (0.0.0.0 — NPM is the only thing in front)
#   -c   user:pass (HTTP Basic Auth)
#   -W   writable terminal (the TUI needs key input)
#   -t   xterm.js client options
# Origin check stays OFF (default) — NPM rewrites the Host header.
exec ttyd \
  -p "${PORT}" \
  -i 0.0.0.0 \
  -c "${CAREEROPS_WEB_USER}:${CAREEROPS_WEB_PASS}" \
  -W \
  -t titleFixed='career-ops' \
  -t 'theme={"background":"#1e1e2e","foreground":"#cdd6f4"}' \
  -t fontSize=14 \
  /usr/local/bin/career-dashboard --path "${WORKSPACE}"
