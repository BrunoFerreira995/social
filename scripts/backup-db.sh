#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_DIR/social-$STAMP.dump"
find "$BACKUP_DIR" -type f -name 'social-*.dump' -mtime +14 -delete
echo "Backup written to $BACKUP_DIR/social-$STAMP.dump"
