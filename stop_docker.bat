@echo off
echo 🛑 Остановка приложения...
cd /d "%~dp0"

docker-compose down

echo ✅ Приложение остановлено!
echo.
echo 💡 Для запуска снова используйте: start_docker.bat
echo.

pause
