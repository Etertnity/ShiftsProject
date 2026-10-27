@echo off
REM Установка всего, что нужно для запуска Shift Control на этом компьютере (Windows).
REM Запускать из папки проекта двойным щелчком или командой install_dependencies.bat
REM Повторный запуск безопасен: обновит зависимости до версий из requirements.txt и package-lock.json
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo === Shift Control: установка зависимостей ===
echo.

REM --- 1. Python 3.11+ ---
set "PY="
where py >nul 2>&1 && py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=py -3"
if not defined PY (
    where python >nul 2>&1 && python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo [ОШИБКА] Нужен Python 3.11 или новее: https://www.python.org/downloads/
    echo          При установке отметьте "Add python.exe to PATH".
    goto :fail
)
for /f "delims=" %%v in ('%PY% -c "import platform; print(platform.python_version())"') do echo [OK] Python %%v

REM --- 2. Node.js 18+ ---
where node >nul 2>&1 || (
    echo [ОШИБКА] Нужен Node.js 18 или новее ^(LTS^): https://nodejs.org/
    goto :fail
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" || (
    echo [ОШИБКА] Node.js слишком старый, нужен 18 или новее: https://nodejs.org/
    goto :fail
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

REM --- 3. Бэкенд: виртуальное окружение и пакеты Python ---
echo.
echo --- Бэкенд ---
if not exist "backend\venv\Scripts\python.exe" (
    echo Создаю виртуальное окружение backend\venv...
    %PY% -m venv backend\venv || goto :fail
)
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip --disable-pip-version-check -q || goto :fail
echo Устанавливаю пакеты Python ^(requirements-dev.txt: приложение + тесты^)...
"backend\venv\Scripts\python.exe" -m pip install -r backend\requirements-dev.txt --disable-pip-version-check || goto :fail
"backend\venv\Scripts\python.exe" -m pip check || goto :fail
REM Старые библиотеки прошлых версий (заменены на PyJWT) — удаляем, если остались
"backend\venv\Scripts\python.exe" -m pip uninstall -y -q python-jose ecdsa >nul 2>&1
echo [OK] Бэкенд готов

REM --- 4. Фронтенд: пакеты npm строго по package-lock.json ---
echo.
echo --- Фронтенд ---
pushd frontend
if exist package-lock.json (
    call npm ci --no-audit --no-fund || (popd & goto :fail)
) else (
    call npm install --no-audit --no-fund || (popd & goto :fail)
)
popd
echo [OK] Фронтенд готов

REM --- 5. Файл настроек ---
echo.
if not exist ".env" (
    copy /y env.example .env >nul
    echo [OK] Создан .env из env.example — при необходимости поправьте настройки
    echo      ^(пароль первого администратора: DEFAULT_ADMIN_PASSWORD, Zabbix: ZABBIX_*^)
) else (
    echo [OK] .env уже есть — не трогаю
)

echo.
echo === Готово ===
echo Запуск:  start_backend.bat  и  start_frontend.bat  ^(в двух окнах^)
echo Сайт:    http://localhost:3000
echo Тесты:   backend\venv\Scripts\python -m pytest backend\tests
echo.
pause
exit /b 0

:fail
echo.
echo Установка не завершена — смотрите сообщение выше.
pause
exit /b 1
