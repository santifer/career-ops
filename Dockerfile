# syntax=docker/dockerfile:1.7
#
# career-ops web GUI = ttyd (browser xterm + HTTP Basic Auth) wrapping
# the upstream Go TUI dashboard. The project directory is bind-mounted at
# /workspace so the host's Claude Code CLI and the container share state.

# ── Stage 1: build the Go TUI dashboard ──────────────────────────────────
FROM golang:1.24-alpine AS dashboard-builder

WORKDIR /src
COPY dashboard/go.mod dashboard/go.sum ./
RUN go mod download

COPY dashboard/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/career-dashboard .

# ── Stage 2: ttyd + dashboard runtime ────────────────────────────────────
FROM debian:bookworm-slim AS runtime

ARG TTYD_VERSION=1.7.7

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl tini bash less locales \
 && curl -fsSL -o /usr/local/bin/ttyd \
      "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
 && chmod +x /usr/local/bin/ttyd \
 && sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen && locale-gen \
 && apt-get purge -y curl \
 && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TERM=xterm-256color \
    COLORTERM=truecolor

COPY --from=dashboard-builder /out/career-dashboard /usr/local/bin/career-dashboard
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Non-root user so the bind-mounted /workspace is read/written as the host's
# `app` user (uid 1001). Override at runtime if your uid differs.
ARG APP_UID=1001
ARG APP_GID=1001
RUN groupadd -g ${APP_GID} app && useradd -m -u ${APP_UID} -g ${APP_GID} -s /bin/bash app
USER app

WORKDIR /workspace
EXPOSE 7681

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
