#!/usr/bin/env bash
# Установка зависимостей для локального запуска Shift Control (Linux / macOS).
# На Windows — install_dependencies.bat в корне проекта. Для сервера — deploy-vps.sh (там всё в Docker).
#
#   bash scripts/install-dev.sh
#
# Повторный запуск безопасен: приводит пакеты к версиям из requirements.txt и package-lock.json.
set -euo pipefail
cd "$(dirname "$0")/.."

ok()   { echo -e "\033[0;32m[OK]\033[0m $*"; }
fail() { echo -e "\033[0;31m[ОШИБКА]\033[0m $*" >&2; exit 1; }

echo "=== Shift Control: установка зависимостей ==="

# --- Python 3.11+ ---
PY=""
for candidate in python3.13 python3.12 python3.11 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 \
        && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
        PY="$candidate"
        break
    fi
done
[[ -n "$PY" ]] || fail "Нужен Python 3.11 или новее (Ubuntu: sudo apt install python3 python3-venv)"
ok "Python $("$PY" -c 'import platform; print(platform.python_version())')"

# --- Node.js 18+ ---
command -v node >/dev/null 2>&1 || fail "Нужен Node.js 18 или новее: https://nodejs.org/"
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" \
    || fail "Node.js слишком старый ($(node -v)), нужен 18 или новее"
ok "Node.js $(node -v)"

# --- Бэкенд ---
echo "--- Бэкенд ---"
if [[ ! -x backend/venv/bin/python ]]; then
    "$PY" -m venv backend/venv || fail "Не удалось создать venv (Ubuntu: sudo apt install python3-venv)"
fi
backend/venv/bin/python -m pip install --upgrade pip --disable-pip-version-check -q
backend/venv/bin/python -m pip install -r backend/requirements-dev.txt --disable-pip-version-check
backend/venv/bin/python -m pip check
# Библиотеки прошлых версий (заменены на PyJWT) — удаляем, если остались
backend/venv/bin/python -m pip uninstall -y -q python-jose ecdsa >/dev/null 2>&1 || true
ok "Бэкенд готов"

# --- Фронтенд ---
echo "--- Фронтенд ---"
if [[ -f frontend/package-lock.json ]]; then
    (cd frontend && npm ci --no-audit --no-fund)
else
    (cd frontend && npm install --no-audit --no-fund)
fi
ok "Фронтенд готов"

# --- Настройки ---
if [[ ! -f .env ]]; then
    cp env.example .env
    ok "Создан .env из env.example — при необходимости поправьте (DEFAULT_ADMIN_PASSWORD, ZABBIX_*)"
else
    ok ".env уже есть — не трогаю"
fi

cat <<'EOF'

=== Готово ===
Бэкенд:   cd backend && venv/bin/python -m uvicorn main:app --reload
Фронтенд: cd frontend && npm start          → http://localhost:3000
Тесты:    backend/venv/bin/python -m pytest backend/tests
EOF
