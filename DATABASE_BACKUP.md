# 💾 Бэкап и восстановление базы (SQLite)

Все данные сайта — в одном файле: **`/opt/shift-control/data/shifts.db`** на сервере (в контейнере — `/app/data/shifts.db`). Секреты (`SECRET_KEY`, пароль Zabbix) — в `/opt/shift-control/.env`, храните его копию отдельно, в менеджере паролей.

## Автоматический бэкап

`deploy-vps.sh` ставит в cron ежедневный запуск `scripts/backup.sh` в 03:15:

- копия делается **на ходу** (SQLite backup API внутри контейнера) — сайт не останавливается, файл всегда целостный;
- результат: `backups/shifts_ГГГГ-ММ-ДД_ЧЧММ.db.gz`, права `600`, папка `700`;
- хранятся 14 дней (переменная `BACKUP_KEEP_DAYS`);
- журнал: `logs/backup.log`.

Проверить, что cron настроен: `sudo crontab -l | grep backup.sh`.

## Вручную

```bash
cd /opt/shift-control
sudo ./scripts/backup.sh
ls -lh backups | tail
```

## Проверка бэкапа

```bash
cd /opt/shift-control
LATEST=$(ls -1t backups/shifts_*.db.gz | head -n1); echo "$LATEST"
gzip -t "$LATEST" && echo "архив цел"
gunzip -c "$LATEST" > /tmp/check.db
sudo docker run --rm -v /tmp/check.db:/check.db:ro python:3.11-slim \
  python -c "import sqlite3; c=sqlite3.connect('/check.db'); print(c.execute('pragma integrity_check').fetchone()[0], c.execute('select count(*) from shift_handovers').fetchone()[0], 'передач')"
rm -f /tmp/check.db
```

## Восстановление

```bash
cd /opt/shift-control
sudo ./scripts/restore.sh backups/shifts_2026-10-21_0315.db.gz
```

Скрипт останавливает бэкенд, сохраняет текущую базу в `backups/before-restore_*.db.gz`, подкладывает бэкап и запускает бэкенд снова.

## Копия на другую машину

Бэкапы на том же сервере не спасут, если пропадёт сервер. Забирайте их с другой машины по SSH (ключ с доступом только на чтение):

```bash
# Linux, cron на машине для бэкапов
rsync -a user@сервер:/opt/shift-control/backups/ /srv/backups/shift-control/
```

```powershell
# Windows: разово скачать последний бэкап
scp user@сервер:/opt/shift-control/backups/shifts_2026-10-21_0315.db.gz "$env:USERPROFILE\Downloads\"
```

> ⚠️ Не выкладывайте базу в публичные файлообменники (transfer.sh и т.п.) и не поднимайте «временный» веб-сервер на папке с бэкапами: в базе — данные сотрудников, кейсы клиентов и журнал работы. Только SSH/SCP или корпоративное хранилище.

## Выгрузка данных для людей

Для отчётов не нужно открывать базу: на сайте «Передачи смен» → **Excel** — передачи, кейсы и история за выбранный период.

## Если база была внутри контейнера (старые установки)

В самых старых версиях база лежала в контейнере по пути `/app/shifts.db` и пропадала при пересоздании контейнера. Перед обновлением заберите её:

```bash
cd /opt/shift-control
sudo docker exec shift_management_backend sh -c 'echo $DATABASE_URL; ls -l /app/*.db /app/data/*.db 2>/dev/null'
# если база в /app/shifts.db:
sudo mkdir -p data
sudo docker cp shift_management_backend:/app/shifts.db data/shifts.db
# если сервер запускали через docker-compose.yml (именованный том db_data), а data/shifts.db на сервере нет:
sudo docker cp shift_management_backend:/app/data/shifts.db data/shifts.db
```

Новая версия хранит базу в `data/shifts.db` на сервере (bind-mount), она переживает пересборку контейнеров.
