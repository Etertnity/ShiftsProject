#!/usr/bin/env bash
# Старый скрипт развёртывания заменён на deploy-vps.sh (HTTPS, файрвол, бэкапы). Оставлен для совместимости.
exec "$(dirname "$0")/deploy-vps.sh" "$@"
