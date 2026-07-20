#!/bin/sh
# Nightly PostgreSQL backup with retention. Invoked by the `backup` service.
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="/backups/pharmasaas-${STAMP}.sql.gz"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

echo "[backup] dumping database to ${OUT}"
pg_dump -h postgres -U pharmasaas -d pharmasaas | gzip > "${OUT}"

echo "[backup] pruning archives older than ${RETENTION} days"
find /backups -name 'pharmasaas-*.sql.gz' -type f -mtime "+${RETENTION}" -delete

echo "[backup] done: $(ls -1 /backups/pharmasaas-*.sql.gz 2>/dev/null | wc -l) archive(s) retained"
