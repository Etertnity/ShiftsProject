@echo off
echo 🐳 Запуск приложения с Docker...
cd /d "%~dp0"

REM Проверяем, запущен ли Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker не найден или не запущен!
    echo Пожалуйста, установите и запустите Docker Desktop
    echo Скачать можно здесь: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo 🔨 Сборка и запуск контейнеров...
docker-compose down --remove-orphans
docker-compose up -d --build

REM Ждем запуска сервисов
echo ⏳ Ожидание запуска сервисов...
timeout /t 10 /nobreak >nul

REM Проверяем статус
echo 📊 Статус сервисов:
docker-compose ps

echo.
echo ✅ Приложение запущено!
echo.
echo 🌐 Сайт: http://localhost
echo 🔧 Backend: http://localhost:8000
echo 📚 API Docs: http://localhost:8000/docs
echo.
echo 💡 Для остановки приложения запустите: stop_docker.bat
echo 📋 Для просмотра логов: docker-compose logs -f
echo.

pause
