#!/bin/sh
# Запускается от root только чтобы выставить владельца папок данных (в т.ч. старых томов, созданных root),
# затем приложение работает от непривилегированного пользователя app.
set -e
if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/data /app/logs
    chown -R app:app /app/data /app/logs
    exec setpriv --reuid=app --regid=app --init-groups "$@"
fi
exec "$@"
