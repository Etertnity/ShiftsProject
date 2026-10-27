# 🪟 Установка и запуск на Windows

Данное руководство поможет вам установить и запустить приложение для управления сменами на Windows.

## 📋 Предварительные требования

### 1. Установка Python

1. Перейдите на https://www.python.org/downloads/
2. Скачайте Python 3.11 или новее
3. **ВАЖНО**: При установке обязательно отметьте "Add Python to PATH"
4. Проверьте установку:
   ```cmd
   python --version
   pip --version
   ```

### 2. Установка Node.js

1. Перейдите на https://nodejs.org/
2. Скачайте LTS версию
3. Установите с настройками по умолчанию
4. Проверьте установку:
   ```cmd
   node --version
   npm --version
   ```

### 3. Установка Git (опционально)

1. Скачайте Git с https://git-scm.com/download/win
2. Установите с настройками по умолчанию

## 🚀 Запуск приложения

### Способ 1: Локальная разработка

> **Самый простой путь:** запустите `install_dependencies.bat` из папки проекта — он проверит Python и Node.js и поставит все зависимости бэкенда и фронтенда. После `git pull` запускайте его снова, чтобы подтянуть новые версии пакетов. Затем — `start_backend.bat` и `start_frontend.bat`.

#### Запуск Backend

1. Откройте PowerShell или Command Prompt
2. Перейдите в папку с проектом:
   ```cmd
   cd C:\path\to\your\project
   cd backend
   ```

3. Создайте виртуальное окружение:
   ```cmd
   python -m venv venv
   ```

4. Активируйте виртуальное окружение:
   ```cmd
   # PowerShell:
   venv\Scripts\Activate.ps1
   
   # Command Prompt:
   venv\Scripts\activate.bat
   ```

5. Установите зависимости:
   ```cmd
   pip install -r requirements.txt
   ```

6. Запустите сервер:
   ```cmd
   python main.py
   ```

Backend будет доступен по адресу: http://localhost:8000

#### Запуск Frontend

1. Откройте новое окно PowerShell/CMD
2. Перейдите в папку frontend:
   ```cmd
   cd C:\path\to\your\project
   cd frontend
   ```

3. Установите зависимости:
   ```cmd
   npm install
   ```

4. Запустите dev сервер:
   ```cmd
   npm start
   ```

Frontend будет доступен по адресу: http://localhost:3000

### Способ 2: Docker Desktop (Рекомендуется)

#### Установка Docker Desktop

1. Скачайте Docker Desktop с https://www.docker.com/products/docker-desktop/
2. Установите и запустите Docker Desktop
3. Убедитесь, что Docker запущен (иконка в системном трее)

#### Запуск приложения

1. Откройте PowerShell в папке проекта:
   ```cmd
   cd C:\path\to\your\project
   ```

2. Запустите приложение:
   ```cmd
   docker-compose up -d --build
   ```

3. Проверьте статус:
   ```cmd
   docker-compose ps
   ```

Приложение будет доступно:
- Сайт: http://localhost (через nginx; порты открыты только для этого компьютера)
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

**Первый вход.** На пустой базе создаётся администратор `Sideffect` со случайным временным паролем — он один раз печатается в логе бэкенда: `docker-compose logs backend | findstr временным` (при запуске без Docker — в окне `start_backend.bat`). Чтобы задать пароль самому, впишите `DEFAULT_ADMIN_PASSWORD=...` в файл `.env` в корне проекта до первого запуска. При первом входе система попросит сменить пароль.

## 🔧 Управление приложением

### Остановка приложения

```cmd
# Для Docker:
docker-compose down

# Для локального запуска:
# Нажмите Ctrl+C в окнах с запущенными серверами
```

### Просмотр логов

```cmd
# Docker:
docker-compose logs -f

# Локально:
# Логи отображаются в консоли
```

### Обновление приложения

```cmd
# Docker:
docker-compose down
docker-compose up -d --build

# Локально:
# Перезапустите серверы после внесения изменений
```

## ❗ Устранение неполадок

### Python не найден

**Проблема**: `python` не распознается как команда

**Решение**:
1. Переустановите Python с официального сайта
2. Обязательно отметьте "Add Python to PATH"
3. Перезапустите PowerShell/CMD
4. Если не помогает, добавьте Python в PATH вручную:
   - Откройте "Переменные среды"
   - Добавьте путь к Python (обычно `C:\Users\Username\AppData\Local\Programs\Python\Python311`)

### pip не найден

**Проблема**: `pip` не распознается как команда

**Решение**:
```cmd
python -m pip --version
python -m pip install -r requirements.txt
```

### Порт уже используется

**Проблема**: `Port 8000 is already in use`

**Решение**:
```cmd
# Найти процесс, использующий порт
netstat -ano | findstr :8000

# Завершить процесс (замените PID на найденный)
taskkill /PID <PID> /F
```

### Проблемы с правами доступа

**Проблема**: Ошибки доступа при установке пакетов

**Решение**:
1. Запустите PowerShell от имени администратора
2. Или используйте виртуальное окружение Python

### Docker не запускается

**Проблема**: Docker команды не работают

**Решение**:
1. Убедитесь, что Docker Desktop запущен
2. Проверьте, что виртуализация включена в BIOS
3. Для Windows Home: установите WSL2

## 📝 Дополнительные команды

### Создание ярлыков для запуска

Создайте bat файлы для быстрого запуска:

**start_backend.bat**:
```batch
@echo off
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
python main.py
pause
```

**start_frontend.bat**:
```batch
@echo off
cd /d "%~dp0frontend"
npm start
pause
```

**start_docker.bat**:
```batch
@echo off
cd /d "%~dp0"
docker-compose up -d --build
echo Приложение запущено!
echo Frontend: http://localhost:3000
echo Backend: http://localhost:8000
pause
```

### Автозапуск с Windows

Для автозапуска приложения при загрузке Windows:

1. Создайте задачу в Планировщике заданий
2. Укажите путь к start_docker.bat
3. Настройте запуск при загрузке системы

## 🔗 Полезные ссылки

- [Python для Windows](https://www.python.org/downloads/windows/)
- [Node.js для Windows](https://nodejs.org/en/download/)
- [Docker Desktop для Windows](https://docs.docker.com/desktop/install/windows-install/)
- [Git для Windows](https://git-scm.com/download/win)
- [Visual Studio Code](https://code.visualstudio.com/) - рекомендуемый редактор

## 💡 Советы

1. **Используйте Docker** - это самый простой способ запуска
2. **Установите Windows Terminal** - современный терминал для Windows
3. **Используйте WSL2** - для лучшей совместимости с Linux инструментами
4. **Настройте антивирус** - добавьте папку проекта в исключения

---

Если у вас остались вопросы, обратитесь к основному README.md или создайте issue в репозитории проекта.
