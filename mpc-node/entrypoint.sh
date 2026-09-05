#!/bin/sh
# GlobalPay MPC node — container entrypoint.
#
# Railway mounts persistent volumes as root, so a non-root container user
# cannot write to the volume. This entrypoint runs as root only long enough to
# make the node's data directory (MPC_NODE_DATA_DIR, the /data volume) writable
# by UID 65532, then drops privileges with setpriv and execs the static binary
# as PID 1 so it receives signals (e.g. SIGTERM) directly.
set -eu

data_dir="${MPC_NODE_DATA_DIR:-/data}"

mkdir -p "$data_dir"
chown -R 65532:65532 "$data_dir"

exec setpriv --reuid=65532 --regid=65532 --clear-groups /app/mpc-node
