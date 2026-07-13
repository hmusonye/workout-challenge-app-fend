#!/usr/bin/env sh
set -eu
root="${BACKUP_DIR:-./backups}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$root/daily" "$root/weekly" "$root/monthly"
file="$root/daily/reps-${stamp}.dump.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom | gzip > "$file"
[ "$(date -u +%u)" = "7" ] && cp "$file" "$root/weekly/" || true
[ "$(date -u +%d)" = "01" ] && cp "$file" "$root/monthly/" || true
find "$root/daily" -type f -mtime +7 -delete
find "$root/weekly" -type f -mtime +31 -delete
find "$root/monthly" -type f -mtime +186 -delete
printf '%s\n' "Backup created. Encrypt and copy the retained files to a second machine or object store."
