#!/usr/bin/env bash
# Restore a PharmaSaaS backup archive into the running database.
# Usage: ./restore.sh backups/pharmasaas-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail

cd "$(dirname "$0")"

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: ./restore.sh <path-to-.sql.gz>"
  echo "Available backups:"
  ls -1 backups/*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

echo "!! This will OVERWRITE the current database with ${ARCHIVE}."
printf "Type 'yes' to continue: "
read -r CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }

echo "==> Restoring…"
gunzip -c "$ARCHIVE" | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U pharmasaas -d pharmasaas

echo "==> Restore complete."
