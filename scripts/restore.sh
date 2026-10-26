#!/usr/bin/env bash
# Восстановление базы из бэкапа: sudo ./scripts/restore.sh backups/shifts_2026-10-21_0315.db.gz
# Текущая база перед заменой сохраняется в backups/before-restore_*.db.gz
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP="${1:-}"
[[ -f "$BACKUP" ]] || { echo "Укажите файл бэкапа: sudo ./scripts/restore.sh backups/shifts_....db.gz" >&2; exit 1; }
gzip -t "$BACKUP"

COMPOSE="docker compose -f docker-compose.prod.yml"
STAMP="$(date +%F_%H%M%S)"
$COMPOSE stop backend
if [[ -f data/shifts.db ]]; then
    gzip -c data/shifts.db > "backups/before-restore_${STAMP}.db.gz"
fi
gunzip -c "$BACKUP" > data/shifts.db
chown 1000:1000 data/shifts.db
chmod 600 data/shifts.db
$COMPOSE start backend
echo "Восстановлено из $BACKUP. Предыдущая база: backups/before-restore_${STAMP}.db.gz"
