# 🔄 Система управления сменами

Современное web-приложение для управления рабочими сменами и передачи смен между сотрудниками.

## 🚀 Особенности

- **Управление сменами**: Создание, редактирование и удаление смен
- **Управление сотрудниками**: Добавление и управление персоналом
- **Передача смен**: Детальная передача информации между сменами
- **Дашборд**: Обзор текущего состояния системы
- **Современный UI**: Responsive дизайн с Tailwind CSS
- **REST API**: Полнофункциональное API с автоматической документацией
- **Docker**: Контейнеризация для легкого деплоя

## 🛠 Технологии

### Frontend
- **React 18** с TypeScript
- **Tailwind CSS** для стилизации
- **React Router** для навигации
- **React Hook Form** для форм
- **Axios** для HTTP запросов
- **Lucide React** для иконок

### Backend
- **FastAPI** - современный Python веб-фреймворк
- **SQLAlchemy** - ORM для работы с базой данных
- **SQLite** - легковесная база данных
- **Pydantic** - валидация данных
- **Uvicorn** - ASGI сервер

### DevOps
- **Docker & Docker Compose** - контейнеризация
- **Nginx** - reverse proxy и load balancer
- **Ubuntu 24.04** - целевая операционная система

## 📁 Структура проекта

```
project/
├── backend/                 # FastAPI бэкенд
│   ├── main.py             # Основное приложение
│   ├── requirements.txt    # Python зависимости
│   └── Dockerfile         # Docker конфигурация
├── frontend/               # React фронтенд
│   ├── src/
│   │   ├── pages/         # Страницы приложения
│   │   ├── types.ts       # TypeScript типы
│   │   ├── api.ts         # API клиент
│   │   └── App.tsx        # Главный компонент
│   ├── package.json       # Node.js зависимости
│   └── Dockerfile        # Docker конфигурация
├── docker-compose.yml     # Оркестрация контейнеров
├── nginx.conf            # Nginx конфигурация
├── deploy.sh            # Скрипт деплоя
└── README.md           # Документация
```

## 🚀 Быстрый старт

> **🪟 Пользователи Windows**: Смотрите [WINDOWS_SETUP.md](WINDOWS_SETUP.md) для подробных инструкций по установке на Windows

### Локальная разработка

#### Требования
- Python 3.11+
- Node.js 18+
- npm или yarn

#### Backend

```bash
# Перейти в папку backend
cd backend

# Создать виртуальное окружение
python -m venv venv

# Активировать виртуальное окружение
# Windows:
venv\\Scripts\\activate
# Linux/Mac:
source venv/bin/activate

# Установить зависимости
pip install -r requirements.txt

# Запустить сервер
python main.py
```

Backend будет доступен по адресу: http://localhost:8000
API документация: http://localhost:8000/docs

#### Frontend

```bash
# Перейти в папку frontend
cd frontend

# Установить зависимости
npm install

# Запустить dev сервер
npm start
```

Frontend будет доступен по адресу: http://localhost:3000

## 🐳 Деплой с Docker

### Локальный деплой

**Linux/Mac:**
```bash
# Клонировать репозиторий
git clone <repository-url>
cd project

# Запустить с Docker Compose
docker-compose up -d --build
```

**Windows:**
```cmd
# Клонировать репозиторий
git clone <repository-url>
cd project

# Запустить одним кликом
start_docker.bat

# Или вручную
docker-compose up -d --build
```

Приложение будет доступно:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Nginx: http://localhost:80

### Деплой на Ubuntu VPS

#### 1. Подготовка сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить необходимые пакеты
sudo apt install -y curl git ufw
```

#### 2. Клонирование проекта

```bash
# Клонировать проект
git clone <your-repository-url>
cd project
```

#### 3. Автоматический деплой

```bash
# Сделать скрипт исполняемым
chmod +x deploy.sh

# Запустить деплой
./deploy.sh
```

Скрипт автоматически:
- Установит Docker и Docker Compose
- Создаст необходимые директории
- Настроит переменные окружения
- Соберет и запустит контейнеры
- Настроит автозапуск
- Настроит firewall (опционально)

#### 4. Ручной деплой

Если предпочитаете ручную настройку:

```bash
# Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установить Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Создать .env файл
cp .env.example .env
nano .env

# Запустить приложение
docker-compose up -d --build
```

## 🔧 Управление приложением

### Основные команды

```bash
# Запустить все сервисы
docker-compose up -d

# Остановить все сервисы
docker-compose down

# Перезапустить сервисы
docker-compose restart

# Посмотреть логи
docker-compose logs -f

# Посмотреть статус
docker-compose ps

# Обновить приложение
git pull origin main
docker-compose down
docker-compose up -d --build
```

### Мониторинг

```bash
# Логи конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f nginx

# Использование ресурсов
docker stats
```

## 🔒 Безопасность

### Рекомендации для продакшена

1. **SSL сертификаты**: Настройте HTTPS с Let's Encrypt
2. **Firewall**: Ограничьте доступ к портам
3. **Backup**: Настройте регулярные бэкапы базы данных
4. **Мониторинг**: Используйте системы мониторинга
5. **Обновления**: Регулярно обновляйте зависимости

### Настройка SSL

```bash
# Установить Certbot
sudo apt install certbot python3-certbot-nginx

# Получить SSL сертификат
sudo certbot --nginx -d your-domain.com

# Автообновление сертификата
sudo crontab -e
# Добавить строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 API Документация

API автоматически документируется с помощью FastAPI.

### Доступные эндпоинты:

- **GET /**: Статус API
- **GET /api/users/**: Список всех сотрудников
- **POST /api/users/**: Создать сотрудника
- **GET /api/shifts/**: Список смен (с фильтром по дате)
- **POST /api/shifts/**: Создать смену
- **PUT /api/shifts/{id}**: Обновить смену
- **DELETE /api/shifts/{id}**: Удалить смену
- **GET /api/handovers/**: Список передач смен
- **POST /api/handovers/**: Создать передачу смены
- **PUT /api/handovers/{id}/complete**: Завершить передачу

Полная интерактивная документация: `http://your-server:8000/docs`

## 🔄 Backup и восстановление

### Создание бэкапа

```bash
# Создать бэкап базы данных
docker-compose exec backend cp /app/shifts.db /app/backup_$(date +%Y%m%d_%H%M%S).db

# Скопировать бэкап на хост
docker cp shift_management_backend:/app/backup_*.db ./backups/
```

### Восстановление

```bash
# Остановить приложение
docker-compose down

# Восстановить базу данных
cp ./backups/backup_YYYYMMDD_HHMMSS.db ./backend/shifts.db

# Запустить приложение
docker-compose up -d
```

## 🐛 Устранение неполадок

### Частые проблемы

1. **Порт уже используется**
   ```bash
   # Найти процесс, использующий порт
   sudo netstat -tlnp | grep :8000
   # Завершить процесс
   sudo kill -9 <PID>
   ```

2. **Проблемы с правами доступа**
   ```bash
   # Изменить владельца файлов
   sudo chown -R $USER:$USER .
   ```

3. **Контейнеры не запускаются**
   ```bash
   # Посмотреть логи
   docker-compose logs
   # Пересобрать контейнеры
   docker-compose up -d --build --force-recreate
   ```

### Логи

```bash
# Системные логи
journalctl -u shift-management.service -f

# Логи приложения
docker-compose logs -f --tail=100
```

## 🤝 Вклад в проект

1. Fork проекта
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. См. файл `LICENSE` для подробностей.

## 🆘 Поддержка

Если у вас возникли проблемы или вопросы:

1. Проверьте раздел "Устранение неполадок"
2. Посмотрите существующие issues
3. Создайте новый issue с детальным описанием проблемы

## 📈 Планы развития

- [ ] Аутентификация и авторизация пользователей
- [ ] Уведомления (email, push)
- [ ] Мобильное приложение
- [ ] Интеграция с календарем
- [ ] Отчеты и аналитика
- [ ] API для интеграции с другими системами
- [ ] Поддержка нескольких языков

---

**Создано с ❤️ для эффективного управления сменами**
