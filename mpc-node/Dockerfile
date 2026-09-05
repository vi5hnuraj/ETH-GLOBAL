# ── Build stage ─────────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Cache dependencies first for faster incremental builds.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Build a static, non-cgo binary so it runs on scratch/distroless.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
  -ldflags="-s -w" \
  -o /out/mpc-node ./cmd/server

# ── Runtime stage ───────────────────────────────────────────────────────────
# debian:bookworm-slim (not distroless) because Railway mounts persistent
# volumes as root: the non-root UID 65532 cannot write to the volume without a
# startup step that chowns it, and distroless ships no shell/coreutils/setpriv
# to do that. entrypoint.sh runs as root only to make MPC_NODE_DATA_DIR (the
# /data volume) writable by UID 65532, then drops privileges and execs the
# static binary as PID 1. The node process itself is still non-root.
FROM debian:bookworm-slim

WORKDIR /app
COPY --from=builder /out/mpc-node /app/mpc-node
COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

# Persistent node data (encrypted shares, wallet metadata, preparams cache,
# counters) lives under the /data Railway volume. Kept absolute so the prod
# loader's default ./data/<node>-prod is never used in the container.
ENV MPC_NODE_DATA_DIR=/data

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
