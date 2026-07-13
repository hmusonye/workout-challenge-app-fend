#!/usr/bin/env sh
set -eu
test -n "${1:-}" || { echo "Usage: scripts/restore.sh backup.dump.gz"; exit 1; }
gzip -dc "$1" | docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
