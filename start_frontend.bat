@echo off
echo 🌐 Запуск Frontend сервера...
cd /d "%~dp0frontend"

REM Проверяем, установлены ли зависимости
if not exist "node_modules" (
    echo 📦 Установка зависимостей...
    npm install
)

REM Запускаем dev сервер
echo ✅ Запуск сервера...
echo.
echo Frontend будет доступен по адресу: http://localhost:3000
echo.
echo Нажмите Ctrl+C для остановки сервера
echo.
npm start

pause
