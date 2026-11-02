#!/usr/bin/env bash
# Развёртывание и обновление Shift Control на Ubuntu 22.04 / 24.04.
#
#   sudo ./deploy-vps.sh --domain shifts.example.com --email admin@example.com   # HTTPS от Let's Encrypt
#   sudo ./deploy-vps.sh                                                          # самоподписанный сертификат (по IP)
#
# Скрипт можно запускать повторно — так же обновляется сайт после git pull: данные, .env и сертификаты сохраняются.
# Подробности — VPS_DEPLOYMENT.md.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml"
DOMAIN=""
EMAIL=""

log()  { echo -e "\033[0;32m[$(date +%H:%M:%S)]\033[0m $*"; }
warn() { echo -e "\033[1;33m[ВНИМАНИЕ]\033[0m $*"; }
fail() { echo -e "\033[0;31m[ОШИБКА]\033[0m $*" >&2; exit 1; }

usage() {
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --email)  EMAIL="${2:-}"; shift 2 ;;
        -h|--help) usage ;;
        *) fail "Неизвестный параметр: $1 (см. --help)" ;;
    esac
done

[[ $EUID -eq 0 ]] || fail "Запустите через sudo: sudo ./deploy-vps.sh"
[[ -f docker-compose.prod.yml ]] || fail "Запускайте из папки проекта (рядом с docker-compose.prod.yml)"
if [[ -n "$DOMAIN" && -z "$EMAIL" ]]; then
    fail "Для сертификата Let's Encrypt укажите почту: --email you@example.com"
fi
grep -qi ubuntu /etc/os-release || warn "Скрипт проверялся на Ubuntu; на другой системе возможны отличия"

server_ip() {
    hostname -I 2>/dev/null | awk '{print $1}'
}

# --- 1. Docker ---------------------------------------------------------------
install_docker() {
    if docker compose version >/dev/null 2>&1; then
        log "Docker уже установлен: $(docker --version)"
        return
    fi
    log "Устанавливаю Docker из официального репозитория..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
}

# --- 2. Папки и .env ---------------------------------------------------------
prepare_files() {
    mkdir -p data logs/nginx backups ssl
    # База и бэкапы — только для владельца
    chmod 700 data backups

    if [[ -f .env ]]; then
        log ".env уже есть — оставляю как есть"
        grep -q '^SECRET_KEY=..*' .env || fail "В .env нет SECRET_KEY. Добавьте строку SECRET_KEY=$(openssl rand -hex 32)"
    else
        log "Создаю .env со случайным ключом подписи токенов"
        cat > .env <<EOF
# Создано deploy-vps.sh $(date +%F). Файл содержит секреты: не коммитьте и не пересылайте его.
APP_ENV=production
SECRET_KEY=$(openssl rand -hex 32)

# Первый администратор. Пароль не задан — сервер сгенерирует временный и покажет его один раз
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=

# Защита от подбора пароля
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15

# ICMP-монитор (заполните, если нужен). Пользователь Zabbix — только с правом чтения
ZABBIX_URL=
ZABBIX_USER=
ZABBIX_PASSWORD=
ZABBIX_WEB_URL=
MONITOR_WARN_THRESHOLD=40
MONITOR_CRIT_THRESHOLD=60
EOF
    fi
    chmod 600 .env
}

# --- 3. Сертификат -----------------------------------------------------------
link_letsencrypt() {
    ln -sfn "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ssl/fullchain.pem
    ln -sfn "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ssl/privkey.pem
}

setup_tls() {
    if [[ -n "$DOMAIN" ]]; then
        if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
            log "Получаю сертификат Let's Encrypt для $DOMAIN (домен должен указывать на этот сервер, порт 80 открыт)"
            apt-get install -y certbot
            # Порт 80 нужен certbot — на время получения останавливаем nginx, если он уже запущен
            docker stop shift_management_nginx >/dev/null 2>&1 || true
            certbot certonly --standalone --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAIN"
        fi
        link_letsencrypt
        # Продление (certbot.timer, дважды в день): ненадолго останавливаем nginx и запускаем снова
        mkdir -p /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
        printf '#!/bin/sh\ndocker stop shift_management_nginx >/dev/null 2>&1 || true\n' > /etc/letsencrypt/renewal-hooks/pre/shift-control.sh
        printf '#!/bin/sh\ndocker start shift_management_nginx >/dev/null 2>&1 || true\n' > /etc/letsencrypt/renewal-hooks/post/shift-control.sh
        chmod 755 /etc/letsencrypt/renewal-hooks/pre/shift-control.sh /etc/letsencrypt/renewal-hooks/post/shift-control.sh
        return
    fi

    if [[ -e ssl/fullchain.pem && -e ssl/privkey.pem ]]; then
        log "Сертификат в ./ssl уже есть — использую его"
        return
    fi
    local ip
    ip="$(server_ip)"
    warn "Домен не указан — создаю самоподписанный сертификат для $ip. Браузер покажет предупреждение;"
    warn "для чистого HTTPS запустите повторно с --domain и --email (или положите свой сертификат в ./ssl)."
    openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
        -keyout ssl/privkey.pem -out ssl/fullchain.pem \
        -subj "/CN=$ip" -addext "subjectAltName=IP:$ip" >/dev/null 2>&1
    chmod 600 ssl/privkey.pem
}

# --- 4. Файрвол --------------------------------------------------------------
setup_firewall() {
    if ! command -v ufw >/dev/null 2>&1; then
        apt-get install -y ufw
    fi
    # Существующие правила не сбрасываем — только добавляем нужные
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    if ufw status | grep -q inactive; then
        warn "Включаю ufw: открыты SSH (22), 80 и 443. Если SSH у вас на другом порту — сначала: sudo ufw allow <порт>/tcp"
        ufw --force enable
    fi
    ufw status | sed 's/^/    /'
}

# --- 5. Запуск ---------------------------------------------------------------
deploy() {
    log "Собираю и запускаю контейнеры (первый раз — несколько минут)..."
    $COMPOSE up -d --build --remove-orphans
    # nginx узнаёт адреса backend и frontend только при старте, а после пересборки они меняются —
    # без перезапуска он продолжает слать запросы на старые адреса и отвечает 502
    $COMPOSE restart nginx
    log "Жду, пока сайт ответит..."
    for _ in $(seq 1 30); do
        if curl -fsk https://localhost/healthz >/dev/null 2>&1; then
            log "Сайт работает"
            return
        fi
        sleep 3
    done
    $COMPOSE logs --tail=50 backend nginx || true
    fail "Сайт не ответил за 90 секунд — смотрите логи выше"
}

# --- 6. Бэкапы ---------------------------------------------------------------
setup_backups() {
    chmod 755 scripts/backup.sh
    local line="15 3 * * * $PROJECT_DIR/scripts/backup.sh >> $PROJECT_DIR/logs/backup.log 2>&1"
    if ! crontab -l 2>/dev/null | grep -Fq "$PROJECT_DIR/scripts/backup.sh"; then
        (crontab -l 2>/dev/null; echo "$line") | crontab -
        log "Ежедневный бэкап БД в 03:15 → $PROJECT_DIR/backups (хранятся 14 дней)"
    fi
}

summary() {
    local url="https://${DOMAIN:-$(server_ip)}"
    local admin_line
    admin_line="$($COMPOSE logs backend 2>/dev/null | grep -o 'Создан администратор «.*» с временным паролем: [^ ]*' | tail -1 || true)"
    echo
    log "Готово."
    echo "    Сайт:        $url"
    echo "    Статус:      $COMPOSE ps"
    echo "    Логи:        $COMPOSE logs -f backend"
    echo "    Обновление:  git pull && sudo ./deploy-vps.sh ${DOMAIN:+--domain $DOMAIN --email $EMAIL}"
    echo "    Бэкап сейчас: sudo ./scripts/backup.sh"
    if [[ -n "$admin_line" ]]; then
        echo
        warn "$admin_line"
        warn "Пароль показан один раз. Войдите и задайте свой — до этого система ничего не разрешит."
    fi
}

install_docker
prepare_files
setup_tls
setup_firewall
deploy
setup_backups
summary
