# Kiosk Agent Production Deployment Guide

Пошаговое руководство по развертыванию киоск-агента в production окружении.

## Содержание

1. [Требования к окружению](#требования-к-окружению)
2. [Варианты развертывания](#варианты-развертывания)
3. [Docker развертывание](#docker-развертывание)
4. [Systemd развертывание](#systemd-развертывание)
5. [Переменные окружения](#переменные-окружения)
6. [Мониторинг](#мониторинг)
7. [Резервное копирование](#резервное-копирование)
8. [Роллбек](#роллбек)
9. [Troubleshooting](#troubleshooting)

---

## Требования к окружению

### Минимальные требования

#### Hardware
- CPU: 2 cores (рекомендуется 4 cores)
- RAM: 2 GB (рекомендуется 4 GB)
- Disk: 20 GB свободного пространства (рекомендуется 50 GB)
- Network: стабильное интернет-соединение

#### Software
- OS: Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+) или Windows Server 2019+
- Node.js 20.x LTS
- Docker 24.x+ и Docker Compose 2.x+ (для Docker deployment)
- Git 2.x+
- systemd (для Linux systemd deployment)

### Дополнительные требования

#### Для OBD-II диагностики
- USB-порты для OBD-II адаптеров
- Драйверы для USB-Serial устройств
- Bluetooth (опционально, для Bluetooth OBD адаптеров)

#### Для HTTPS
- SSL сертификаты (Let's Encrypt или коммерческие)
- Доменное имя с настроенным DNS

#### Для мониторинга
- Prometheus 2.45+
- Grafana 10.0+
- Alertmanager 0.26+

---

## Варианты развертывания

### 1. Docker Compose (рекомендуется)

**Преимущества:**
- Полная изоляция приложения
- Простое управление зависимостями
- Встроенный мониторинг и reverse proxy
- Простой откат на предыдущую версию

**Недостатки:**
- Требует Docker
- Немного больше ресурсов

**Подходит для:** Production окружения, staging серверы

### 2. Systemd Service

**Преимущества:**
- Нативная интеграция с ОС
- Меньше накладных расходов
- Прямой доступ к железу (важно для USB устройств)

**Недостатки:**
- Требует ручной настройки зависимостей
- Сложнее изолировать окружение

**Подходит для:** Standalone киоски, embedded системы

### 3. PM2 (для разработки)

**Преимущества:**
- Быстрое развертывание
- Удобный мониторинг
- Автоматический перезапуск

**Недостатки:**
- Не рекомендуется для production
- Требует дополнительную настройку безопасности

**Подходит для:** Development, QA окружения

---

## Docker развертывание

### Шаг 1: Подготовка сервера

```bash
# Обновить систему
sudo apt-get update
sudo apt-get upgrade -y

# Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER

# Установить Docker Compose
sudo apt-get install docker-compose-plugin

# Проверить установку
docker --version
docker compose version
```

### Шаг 2: Клонирование репозитория

```bash
# Создать директорию для проекта
sudo mkdir -p /opt/kiosk
sudo chown $USER:$USER /opt/kiosk

# Клонировать репозиторий
cd /opt/kiosk
git clone https://github.com/InnoScripts2/my-own-service.git
cd my-own-service
```

### Шаг 3: Настройка переменных окружения

```bash
# Создать .env файл
cd infra/docker
cp ../../.env.example .env

# Отредактировать переменные
nano .env
```

Основные переменные:
```env
# Agent configuration
NODE_ENV=production
AGENT_ENV=PROD
AGENT_PORT=7070

# Database
DATABASE_URL=/app/data/kiosk.db

# Logging
LOG_LEVEL=info

# Grafana
GRAFANA_ADMIN_PASSWORD=secure_password_here

# OBD configuration (if needed)
OBD_EMULATOR_ENABLED=false
```

### Шаг 4: Настройка SSL сертификатов

```bash
# Для self-signed сертификатов (тестирование)
cd ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Kiosk/CN=kiosk.local"

# Для Let's Encrypt (production)
sudo apt-get install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/server.crt
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/server.key
sudo chmod 600 ssl/server.key
```

### Шаг 5: Сборка и запуск

```bash
# Собрать Docker образ
docker compose build

# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Проверить логи
docker compose logs -f kiosk-agent
```

### Шаг 6: Проверка развертывания

```bash
# Проверить health endpoint
curl http://localhost:7070/api/health

# Проверить метрики
curl http://localhost:7070/metrics

# Проверить Prometheus
curl http://localhost:9090/-/healthy

# Проверить Grafana
curl http://localhost:3001/api/health

# Проверить HTTPS через Nginx
curl -k https://localhost/api/health
```

### Управление сервисами

```bash
# Остановить все сервисы
docker compose down

# Перезапустить конкретный сервис
docker compose restart kiosk-agent

# Просмотр логов конкретного сервиса
docker compose logs -f kiosk-agent

# Обновление образов
docker compose pull
docker compose up -d

# Полная пересборка
docker compose build --no-cache
docker compose up -d
```

---

## Systemd развертывание

### Шаг 1: Подготовка системы

```bash
# Установить Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Проверить версию
node --version  # должно быть v20.x.x
npm --version
```

### Шаг 2: Создание пользователя

```bash
# Создать системного пользователя
sudo groupadd -r kiosk
sudo useradd -r -g kiosk -d /opt/kiosk-agent -s /bin/bash kiosk
```

### Шаг 3: Использование скрипта развертывания

```bash
# Клонировать репозиторий
cd /tmp
git clone https://github.com/InnoScripts2/my-own-service.git
cd my-own-service

# Запустить скрипт развертывания
sudo bash infra/scripts/deploy.sh
```

Скрипт автоматически:
1. Создаст пользователя и группу
2. Установит зависимости
3. Соберет приложение
4. Скопирует файлы в /opt/kiosk-agent
5. Установит systemd service
6. Предложит запустить сервис

### Шаг 4: Ручное развертывание (если нужно)

```bash
# Создать директории
sudo mkdir -p /opt/kiosk-agent/{data,logs,config}

# Клонировать и собрать
cd /tmp
git clone https://github.com/InnoScripts2/my-own-service.git
cd my-own-service/apps/kiosk-agent

# Установить зависимости и собрать
npm ci
npm run build

# Скопировать файлы
sudo rsync -av dist/ /opt/kiosk-agent/dist/
sudo cp package*.json /opt/kiosk-agent/

# Установить production зависимости
cd /opt/kiosk-agent
sudo npm ci --production

# Настроить права
sudo chown -R kiosk:kiosk /opt/kiosk-agent
sudo chmod -R 755 /opt/kiosk-agent
sudo chmod -R 700 /opt/kiosk-agent/data
sudo chmod -R 700 /opt/kiosk-agent/logs
```

### Шаг 5: Настройка переменных окружения

```bash
# Создать .env файл
sudo nano /opt/kiosk-agent/.env
```

Содержимое:
```env
NODE_ENV=production
AGENT_ENV=PROD
AGENT_PORT=7070
DATABASE_URL=/opt/kiosk-agent/data/kiosk.db
LOG_LEVEL=info
```

### Шаг 6: Установка systemd service

```bash
# Скопировать service файл
sudo cp /tmp/my-own-service/infra/systemd/kiosk-agent.service /etc/systemd/system/

# Перезагрузить systemd
sudo systemctl daemon-reload

# Включить автозапуск
sudo systemctl enable kiosk-agent

# Запустить сервис
sudo systemctl start kiosk-agent

# Проверить статус
sudo systemctl status kiosk-agent
```

### Управление сервисом

```bash
# Запустить
sudo systemctl start kiosk-agent

# Остановить
sudo systemctl stop kiosk-agent

# Перезапустить
sudo systemctl restart kiosk-agent

# Проверить статус
sudo systemctl status kiosk-agent

# Просмотр логов
sudo journalctl -u kiosk-agent -f

# Просмотр последних 100 строк
sudo journalctl -u kiosk-agent -n 100

# Логи за последний час
sudo journalctl -u kiosk-agent --since "1 hour ago"
```

---

## Переменные окружения

### Обязательные переменные

| Переменная | Описание | Значение по умолчанию |
|-----------|----------|----------------------|
| `NODE_ENV` | Режим Node.js | `production` |
| `AGENT_ENV` | Режим агента (DEV/QA/PROD) | `PROD` |
| `AGENT_PORT` | Порт HTTP сервера | `7070` |

### Опциональные переменные

| Переменная | Описание | Значение по умолчанию |
|-----------|----------|----------------------|
| `DATABASE_URL` | Путь к SQLite базе | `/app/data/kiosk.db` |
| `LOG_LEVEL` | Уровень логирования | `info` |
| `CORS_ORIGIN` | Разрешенные CORS origins | `*` |
| `MAX_REQUEST_SIZE` | Максимальный размер запроса | `10mb` |

### OBD-II настройки

| Переменная | Описание | Значение по умолчанию |
|-----------|----------|----------------------|
| `OBD_EMULATOR_ENABLED` | Включить эмулятор OBD | `false` |
| `OBD_DEFAULT_PROTOCOL` | Протокол по умолчанию | `AUTO` |
| `OBD_TIMEOUT_MS` | Таймаут команд OBD | `5000` |

### Платежи (будущая интеграция)

| Переменная | Описание |
|-----------|----------|
| `PAYMENT_PROVIDER` | Провайдер платежей |
| `PAYMENT_API_KEY` | API ключ провайдера |
| `PAYMENT_WEBHOOK_SECRET` | Секрет для webhook |

### Email/SMS (будущая интеграция)

| Переменная | Описание |
|-----------|----------|
| `SMTP_HOST` | SMTP сервер |
| `SMTP_PORT` | SMTP порт |
| `SMTP_USER` | SMTP пользователь |
| `SMTP_PASSWORD` | SMTP пароль |
| `SMS_PROVIDER` | SMS провайдер |
| `SMS_API_KEY` | SMS API ключ |

---

## Мониторинг

### Метрики Prometheus

Агент экспортирует метрики на `/metrics` endpoint:

```bash
curl http://localhost:7070/metrics
```

Основные метрики:
- `http_requests_total` - Счетчик HTTP запросов
- `http_request_duration_seconds` - Длительность запросов
- `payment_operations_total` - Операции платежей
- `obd_connection_attempts_total` - Попытки OBD подключений
- `process_cpu_user_seconds_total` - CPU время
- `process_resident_memory_bytes` - Использование памяти

### Prometheus UI

Доступ к Prometheus UI:
```
http://your-server:9090
```

Примеры запросов:
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Grafana Dashboards

Доступ к Grafana:
```
http://your-server:3001
Логин: admin
Пароль: (из GRAFANA_ADMIN_PASSWORD)
```

После входа:
1. Navigate to Dashboards
2. Import dashboard из `infra/monitoring/grafana/dashboards/`
3. Или создать свой dashboard с метриками из Prometheus

### Alertmanager

Доступ к Alertmanager:
```
http://your-server:9093
```

Просмотр активных алертов и их статусов.

### Health Checks

#### Agent Health
```bash
curl http://localhost:7070/api/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345,
  "version": "0.1.0"
}
```

#### System Health
```bash
# CPU и память
top -b -n 1 | head -20

# Дисковое пространство
df -h

# Сетевые подключения
ss -tuln | grep 7070
```

---

## Резервное копирование

### Что нужно бэкапить

1. **База данных SQLite**
   - Путь: `/app/data/kiosk.db` (Docker) или `/opt/kiosk-agent/data/kiosk.db` (systemd)
   - Содержит: сессии, логи самопроверок, настройки

2. **Конфигурация**
   - `.env` файл
   - `config/` директория

3. **Логи** (опционально)
   - `logs/` директория
   - Можно не бэкапить если используется централизованный logging

### Скрипт автоматического бэкапа

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/backups/kiosk-agent"
DATA_DIR="/opt/kiosk-agent/data"
CONFIG_DIR="/opt/kiosk-agent/config"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Создать директорию для бэкапов
mkdir -p $BACKUP_DIR

# Остановить агент для consistency (опционально)
# sudo systemctl stop kiosk-agent

# Бэкап базы данных
cp -r $DATA_DIR $BACKUP_DIR/data_$TIMESTAMP

# Бэкап конфигурации
cp -r $CONFIG_DIR $BACKUP_DIR/config_$TIMESTAMP
cp /opt/kiosk-agent/.env $BACKUP_DIR/.env_$TIMESTAMP

# Запустить агент
# sudo systemctl start kiosk-agent

# Создать архив
tar -czf $BACKUP_DIR/kiosk-agent-backup-$TIMESTAMP.tar.gz \
  -C $BACKUP_DIR \
  data_$TIMESTAMP \
  config_$TIMESTAMP \
  .env_$TIMESTAMP

# Удалить временные директории
rm -rf $BACKUP_DIR/data_$TIMESTAMP
rm -rf $BACKUP_DIR/config_$TIMESTAMP
rm -f $BACKUP_DIR/.env_$TIMESTAMP

# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "kiosk-agent-backup-*.tar.gz" -mtime +30 -delete

echo "Backup completed: kiosk-agent-backup-$TIMESTAMP.tar.gz"
```

### Настройка автоматического бэкапа

```bash
# Сделать скрипт исполняемым
chmod +x /opt/kiosk-agent/backup.sh

# Добавить в crontab (бэкап каждый день в 2:00 AM)
sudo crontab -e

# Добавить строку:
0 2 * * * /opt/kiosk-agent/backup.sh >> /var/log/kiosk-backup.log 2>&1
```

### Восстановление из бэкапа

```bash
# Остановить агент
sudo systemctl stop kiosk-agent

# Распаковать бэкап
cd /opt/backups/kiosk-agent
tar -xzf kiosk-agent-backup-YYYYMMDD_HHMMSS.tar.gz

# Восстановить данные
sudo cp -r data_YYYYMMDD_HHMMSS/* /opt/kiosk-agent/data/
sudo cp -r config_YYYYMMDD_HHMMSS/* /opt/kiosk-agent/config/
sudo cp .env_YYYYMMDD_HHMMSS /opt/kiosk-agent/.env

# Установить права
sudo chown -R kiosk:kiosk /opt/kiosk-agent/data
sudo chown -R kiosk:kiosk /opt/kiosk-agent/config

# Запустить агент
sudo systemctl start kiosk-agent
```

---

## Роллбек

### Docker роллбек

```bash
# Посмотреть доступные образы
docker images | grep kiosk-agent

# Остановить текущий контейнер
docker compose down

# Переключиться на предыдущий образ
docker tag kiosk-agent:previous kiosk-agent:latest

# Запустить с предыдущим образом
docker compose up -d

# Или использовать конкретный тег
docker compose -f docker-compose.yml up -d kiosk-agent:v1.2.3
```

### Systemd роллбек

#### Вариант 1: Git rollback

```bash
# Остановить сервис
sudo systemctl stop kiosk-agent

# Перейти в директорию с исходниками
cd /tmp/my-own-service

# Откатиться на предыдущий коммит
git log --oneline -10  # посмотреть последние коммиты
git checkout <previous-commit-hash>

# Пересобрать
cd apps/kiosk-agent
npm ci
npm run build

# Скопировать в production
sudo rsync -av dist/ /opt/kiosk-agent/dist/
cd /opt/kiosk-agent
sudo npm ci --production

# Запустить сервис
sudo systemctl start kiosk-agent
```

#### Вариант 2: Восстановление из бэкапа кода

```bash
# Остановить сервис
sudo systemctl stop kiosk-agent

# Восстановить предыдущую версию dist
sudo cp -r /opt/backups/kiosk-agent/dist-previous/* /opt/kiosk-agent/dist/

# Запустить сервис
sudo systemctl start kiosk-agent
```

#### Вариант 3: Использование версионированных директорий

```bash
# Структура версионированных развертываний
/opt/kiosk-agent/
├── releases/
│   ├── v1.0.0/
│   ├── v1.1.0/
│   └── v1.2.0/
└── current -> releases/v1.2.0

# Откат
sudo systemctl stop kiosk-agent
sudo rm /opt/kiosk-agent/current
sudo ln -s /opt/kiosk-agent/releases/v1.1.0 /opt/kiosk-agent/current
sudo systemctl start kiosk-agent
```

### Проверка после роллбека

```bash
# Проверить версию
curl http://localhost:7070/api/health | jq .version

# Проверить логи
sudo journalctl -u kiosk-agent -f

# Проверить статус
sudo systemctl status kiosk-agent

# Проверить метрики
curl http://localhost:7070/metrics | grep version
```

---

## Troubleshooting

### Агент не запускается

#### Проблема: Port уже используется

```bash
# Проверить какой процесс использует порт
sudo lsof -i :7070
sudo ss -tuln | grep 7070

# Убить процесс
sudo kill -9 <PID>

# Или изменить порт в .env
AGENT_PORT=7071
```

#### Проблема: База данных заблокирована

```bash
# Проверить блокировки SQLite
sudo lsof /opt/kiosk-agent/data/kiosk.db

# Если процесс завис, убить его
sudo kill -9 <PID>

# Проверить права доступа
sudo ls -la /opt/kiosk-agent/data/
sudo chown -R kiosk:kiosk /opt/kiosk-agent/data/
```

#### Проблема: Модули не найдены

```bash
# Переустановить зависимости
cd /opt/kiosk-agent
sudo rm -rf node_modules package-lock.json
sudo npm ci --production

# Проверить права
sudo chown -R kiosk:kiosk node_modules
```

### OBD устройство не подключается

```bash
# Проверить USB устройства
lsusb

# Проверить serial порты
ls -la /dev/tty*

# Добавить пользователя в группу dialout
sudo usermod -aG dialout kiosk

# Проверить права доступа к портам
sudo chmod 666 /dev/ttyUSB0

# Проверить логи
sudo journalctl -u kiosk-agent -f | grep -i obd
```

### Высокое потребление памяти

```bash
# Проверить потребление памяти
sudo systemctl status kiosk-agent
ps aux | grep node

# Проверить memory leak через метрики
curl http://localhost:7070/metrics | grep process_resident_memory

# Перезапустить сервис
sudo systemctl restart kiosk-agent

# Настроить memory limit в systemd
sudo nano /etc/systemd/system/kiosk-agent.service
# Добавить: MemoryLimit=1G
sudo systemctl daemon-reload
sudo systemctl restart kiosk-agent
```

### Метрики недоступны

```bash
# Проверить endpoint
curl http://localhost:7070/metrics

# Проверить Prometheus targets
curl http://localhost:9090/api/v1/targets

# Проверить Docker сеть
docker network inspect kiosk_kiosk-network

# Проверить firewall
sudo ufw status
sudo ufw allow 7070/tcp
```

### Логи

```bash
# Systemd логи
sudo journalctl -u kiosk-agent -f
sudo journalctl -u kiosk-agent --since "1 hour ago"
sudo journalctl -u kiosk-agent -p err

# Docker логи
docker compose logs -f kiosk-agent
docker compose logs --tail=100 kiosk-agent

# Application логи
tail -f /opt/kiosk-agent/logs/app.log
tail -f /app/logs/app.log  # в Docker

# Nginx логи
docker compose logs -f nginx
tail -f /var/log/nginx/error.log
```

### Performance профилирование

```bash
# CPU профилирование
node --cpu-prof dist/index.js

# Memory профилирование
node --heap-prof dist/index.js

# Анализ с помощью clinic.js
npm install -g clinic
clinic doctor -- node dist/index.js
```

---

## Обновление

### Minor updates (патчи)

```bash
# Docker
cd /opt/kiosk/my-own-service
git pull origin main
docker compose build
docker compose up -d

# Systemd
cd /tmp/my-own-service
git pull origin main
sudo bash infra/scripts/deploy.sh
```

### Major updates (breaking changes)

1. Создать полный бэкап
2. Протестировать обновление на staging окружении
3. Прочитать CHANGELOG и migration guide
4. Запланировать maintenance window
5. Выполнить обновление
6. Проверить все функции
7. Держать rollback plan готовым

---

## Лучшие практики безопасности

1. **Всегда используйте HTTPS в production**
2. **Регулярно обновляйте зависимости**
   ```bash
   npm audit
   npm audit fix
   ```
3. **Используйте strong passwords для Grafana и других сервисов**
4. **Ограничьте доступ к метрикам и admin endpoints**
5. **Настройте firewall**
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw allow 7070/tcp  # Agent (only if needed externally)
   ```
6. **Регулярно создавайте бэкапы**
7. **Мониторьте логи на подозрительную активность**
8. **Используйте отдельного пользователя (не root)**

---

## Контакты и поддержка

Для вопросов и проблем:
- GitHub Issues: https://github.com/InnoScripts2/my-own-service/issues
- Документация: https://github.com/InnoScripts2/my-own-service/tree/main/docs

---

## Приложение: Чек-лист развертывания

### Pre-deployment
- [ ] Hardware requirements проверены
- [ ] Software requirements установлены
- [ ] SSL сертификаты подготовлены
- [ ] Переменные окружения настроены
- [ ] Backup план создан

### Deployment
- [ ] Код клонирован/скачан
- [ ] Зависимости установлены
- [ ] Приложение собрано
- [ ] Сервисы запущены
- [ ] Health checks прошли

### Post-deployment
- [ ] Мониторинг настроен
- [ ] Алерты настроены
- [ ] Логирование работает
- [ ] Бэкапы настроены
- [ ] Документация обновлена
- [ ] Команда уведомлена

### Ongoing
- [ ] Регулярные бэкапы
- [ ] Мониторинг метрик
- [ ] Обновление зависимостей
- [ ] Проверка логов
- [ ] Тестирование rollback процедуры
