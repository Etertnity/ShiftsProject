# 🚀 Развертывание на VPS Ubuntu 24.04

## 📋 Требования

- **VPS/сервер** с Ubuntu 24.04
- **Минимум 1GB RAM** (рекомендуется 2GB+)
- **Минимум 10GB свободного места** 
- **Root или sudo доступ**
- **Открытые порты**: 22 (SSH), 80 (HTTP), 443 (HTTPS)

## 🔧 Быстрое развертывание

### 1️⃣ Подключение к серверу
```bash
ssh your-username@your-server-ip
```

### 2️⃣ Загрузка проекта
```bash
# Клонирование проекта (если используете Git)
git clone https://github.com/yourusername/shift-management.git
cd shift-management

# ИЛИ загрузка архива
wget https://github.com/yourusername/shift-management/archive/main.zip
unzip main.zip
cd shift-management-main
```

### 3️⃣ Запуск развертывания
```bash
# Сделать скрипт исполняемым
chmod +x deploy-vps.sh

# Запустить развертывание
./deploy-vps.sh
```

## 📁 Альтернативный способ - загрузка файлов

Если у вас есть готовые файлы на Windows:

### 1️⃣ Создание архива проекта
```powershell
# В папке C:\project
Compress-Archive -Path * -DestinationPath shift-management.zip
```

### 2️⃣ Загрузка на сервер
```bash
# Используйте SCP или WinSCP для загрузки
scp shift-management.zip username@server-ip:~/

# На сервере распакуйте
cd ~/
unzip shift-management.zip
chmod +x deploy-vps.sh
./deploy-vps.sh
```

## ⚙️ Что происходит при развертывании

1. **Проверка системы** - Ubuntu версия, права доступа
2. **Установка Docker** и Docker Compose
3. **Создание директорий** для данных, логов, SSL
4. **Настройка .env файла** с IP сервера
5. **Настройка firewall** (опционально)
6. **Сборка и запуск** контейнеров
7. **Настройка автозапуска** через systemd
8. **Создание скрипта бэкапов**

## 🌐 После развертывания

### Доступ к системе:
- **Веб-интерфейс**: `http://YOUR-SERVER-IP`
- **API**: `http://YOUR-SERVER-IP:8000`
- **Документация API**: `http://YOUR-SERVER-IP:8000/docs`

### Вход в систему:
- **Логин**: `Sideffect`
- **Пароль**: `Sid@ffect101`

## 🔧 Управление службой

```bash
# Просмотр статуса
docker-compose -f docker-compose.prod.yml ps

# Просмотр логов
docker-compose -f docker-compose.prod.yml logs -f

# Перезапуск
docker-compose -f docker-compose.prod.yml restart

# Остановка
docker-compose -f docker-compose.prod.yml down

# Запуск
docker-compose -f docker-compose.prod.yml up -d

# Системная служба
sudo systemctl status shift-management
sudo systemctl restart shift-management
```

## 💾 Резервное копирование

```bash
# Создание бэкапа вручную
./backup.sh

# Автоматический бэкап (настроен на 2:00 ночи)
crontab -l  # Просмотр задач cron
```

## 🔒 Настройка SSL (HTTPS)

### Получение сертификата Let's Encrypt:
```bash
# Установка certbot
sudo apt install certbot

# Получение сертификата
sudo certbot certonly --standalone -d your-domain.com

# Копирование сертификатов
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
sudo chown $USER:$USER ./ssl/*.pem

# Раскомментирование HTTPS блока в nginx.prod.conf
nano nginx.prod.conf

# Перезапуск nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

### Автообновление сертификатов:
```bash
# Добавление в crontab
(crontab -l; echo "0 3 * * * certbot renew --quiet && docker-compose -f $(pwd)/docker-compose.prod.yml restart nginx") | crontab -
```

## 🛠️ Troubleshooting

### Проблемы с портами:
```bash
# Проверка используемых портов
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :8000

# Остановка других веб-серверов
sudo systemctl stop apache2 nginx
```

### Проблемы с Docker:
```bash
# Перезапуск Docker
sudo systemctl restart docker

# Очистка системы
docker system prune -a -f

# Проверка логов
docker-compose -f docker-compose.prod.yml logs
```

### Проблемы с правами доступа:
```bash
# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Проверка прав на директории
ls -la ./data ./logs ./ssl
```

### Проблемы с firewall:
```bash
# Проверка статуса UFW
sudo ufw status

# Временное отключение (для диагностики)
sudo ufw disable

# Проверка доступности портов
telnet your-server-ip 80
curl -I http://your-server-ip/health
```

## 📊 Мониторинг

### Проверка использования ресурсов:
```bash
# Использование Docker контейнерами
docker stats

# Использование диска
df -h
du -sh ./data ./logs ./backups

# Использование памяти
free -h

# Загрузка системы
htop
```

### Логи системы:
```bash
# Логи приложения
tail -f ./logs/nginx/access.log
tail -f ./logs/nginx/error.log

# Системные логи
sudo journalctl -u shift-management -f
sudo journalctl -u docker -f
```

## 🔄 Обновление приложения

```bash
# Получение новых файлов (Git)
git pull origin main

# ИЛИ загрузка нового архива и замена файлов

# Пересборка и перезапуск
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

## 🆘 Экстренное восстановление

### Восстановление из бэкапа:
```bash
# Остановка служб
docker-compose -f docker-compose.prod.yml down

# Восстановление данных
tar -xzf ./backups/shift_management_backup_YYYYMMDD_HHMMSS.tar.gz

# Запуск служб
docker-compose -f docker-compose.prod.yml up -d
```

### Полная переустановка:
```bash
# Удаление всех контейнеров и образов
docker-compose -f docker-compose.prod.yml down
docker system prune -a -f

# Повторное развертывание
./deploy-vps.sh
```

---

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose -f docker-compose.prod.yml logs`
2. Проверьте статус: `docker-compose -f docker-compose.prod.yml ps`
3. Проверьте подключение: `curl http://your-server-ip/health`
4. Создайте issue в репозитории с описанием проблемы

**Удачного развертывания! 🚀**
