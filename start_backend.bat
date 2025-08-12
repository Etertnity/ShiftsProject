@echo off
echo 🚀 Запуск Backend сервера...
cd /d "%~dp0backend"

REM Проверяем, существует ли виртуальное окружение
if not exist "venv" (
    echo 📦 Создание виртуального окружения...
    python -m venv venv
)

REM Активируем виртуальное окружение
echo 🔧 Активация виртуального окружения...
call venv\Scripts\activate.bat

REM Устанавливаем зависимости
echo 📥 Установка зависимостей...
pip install -r requirements.txt

REM Запускаем сервер
echo ✅ Запуск сервера...
echo.
echo Backend будет доступен по адресу: http://localhost:8000
echo API документация: http://localhost:8000/docs
echo.
echo Нажмите Ctrl+C для остановки сервера
echo.
python main.py

pause
