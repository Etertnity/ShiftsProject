#!/usr/bin/env bash
# Консистентный бэкап базы (даже во время работы сайта) через SQLite backup API внутри контейнера.
# Запуск вручную: sudo ./scripts/backup.sh   Хранение: 14 дней (BACKUP_KEEP_DAYS).
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%F_%H%M)"
TMP_NAME=".backup-${STAMP}.db"

mkdir -p backups
chmod 700 backups

docker exec shift_management_backend python -c "
import sqlite3
src = sqlite3.connect('/app/data/shifts.db')
dst = sqlite3.connect('/app/data/${TMP_NAME}')
with dst:
    src.backup(dst)
dst.close(); src.close()
"
mv "data/${TMP_NAME}" "backups/shifts_${STAMP}.db"
gzip -f "backups/shifts_${STAMP}.db"
chmod 600 "backups/shifts_${STAMP}.db.gz"
find backups -name 'shifts_*.db.gz' -mtime +"${KEEP_DAYS}" -delete
echo "$(date '+%F %T') бэкап: backups/shifts_${STAMP}.db.gz"
