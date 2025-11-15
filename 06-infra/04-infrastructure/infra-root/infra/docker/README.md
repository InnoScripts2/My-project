# Docker Infrastructure для Kiosk Agent

Production-ready Docker конфигурация для развертывания киоск-агента.

## Быстрый старт

```bash
# Скопировать example env файл
cp ../../.env.example .env

# Отредактировать переменные окружения
nano .env

# Создать SSL сертификаты (для тестирования)
cd ssl
./generate-self-signed.sh
cd ..

# Собрать и запустить все сервисы
docker compose build
docker compose up -d

# Проверить статус
docker compose ps
docker compose logs -f kiosk-agent
```

## Структура файлов

```
infra/docker/
├── Dockerfile              # Production Docker образ (multistage)
├── docker-compose.yml      # Оркестрация сервисов
├── .dockerignore           # Исключения для Docker build
├── prometheus.yml          # Конфигурация Prometheus
├── alertmanager.yml        # Конфигурация Alertmanager
├── nginx.conf              # Nginx reverse proxy с HTTPS
├── alerts/
│   └── rules.yml          # Правила алертов
├── ssl/
│   ├── README.md          # Инструкции по SSL
│   ├── server.crt         # SSL сертификат (не в git)
│   └── server.key         # Приватный ключ (не в git)
└── README.md              # Этот файл
```

## Сервисы

### kiosk-agent
- **Port:** 7070
- **Description:** Основной киоск-агент
- **Health:** http://localhost:7070/api/health
- **Metrics:** http://localhost:7070/metrics

### prometheus
- **Port:** 9090
- **Description:** Сбор и хранение метрик
- **UI:** http://localhost:9090

### alertmanager
- **Port:** 9093
- **Description:** Управление алертами
- **UI:** http://localhost:9093

### grafana
- **Port:** 3001
- **Description:** Визуализация метрик
- **UI:** http://localhost:3001
- **Credentials:** admin / (из GRAFANA_ADMIN_PASSWORD)

### nginx
- **Ports:** 80, 443
- **Description:** Reverse proxy с HTTPS
- **Health:** http://localhost/health

## Переменные окружения

Основные переменные в `.env`:

```env
# Agent
NODE_ENV=production
AGENT_ENV=PROD
AGENT_PORT=7070

# Database
DATABASE_URL=/app/data/kiosk.db

# Logging
LOG_LEVEL=info

# Grafana
GRAFANA_ADMIN_PASSWORD=your_secure_password
```

## Volumes

### Persistent данные

- `kiosk-data` - База данных SQLite
- `kiosk-logs` - Логи приложения
- `prometheus-data` - Метрики Prometheus
- `alertmanager-data` - Данные Alertmanager
- `grafana-data` - Дашборды и настройки Grafana
- `nginx-logs` - Логи Nginx

### Бэкап volumes

```bash
# Список volumes
docker volume ls

# Бэкап volume
docker run --rm -v kiosk-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/kiosk-data-backup.tar.gz -C /data .

# Восстановление volume
docker run --rm -v kiosk-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/kiosk-data-backup.tar.gz -C /data
```

## Команды управления

### Запуск и остановка

```bash
# Запустить все сервисы
docker compose up -d

# Остановить все сервисы
docker compose down

# Остановить с удалением volumes (ОСТОРОЖНО!)
docker compose down -v

# Перезапустить конкретный сервис
docker compose restart kiosk-agent

# Остановить конкретный сервис
docker compose stop kiosk-agent

# Запустить конкретный сервис
docker compose start kiosk-agent
```

### Логи

```bash
# Все логи
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f kiosk-agent

# Последние 100 строк
docker compose logs --tail=100 kiosk-agent

# С timestamp
docker compose logs -f -t kiosk-agent
```

### Обновление

```bash
# Пересобрать образы
docker compose build

# Пересобрать с нуля (без кеша)
docker compose build --no-cache

# Обновить и перезапустить
docker compose build && docker compose up -d

# Pull новые версии базовых образов
docker compose pull
```

### Мониторинг

```bash
# Статус всех сервисов
docker compose ps

# Статистика ресурсов
docker stats

# Проверка health
curl http://localhost:7070/api/health
curl http://localhost:9090/-/healthy
curl http://localhost:3001/api/health
```

### Очистка

```bash
# Удалить остановленные контейнеры
docker compose rm

# Удалить неиспользуемые образы
docker image prune -a

# Удалить все неиспользуемые данные
docker system prune -a --volumes
```

## SSL сертификаты

### Self-signed (для тестирования)

```bash
cd ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Kiosk/CN=kiosk.local"
chmod 600 server.key
cd ..
```

### Let's Encrypt (production)

```bash
# Установить certbot
sudo apt-get install certbot

# Получить сертификат
sudo certbot certonly --standalone -d your-domain.com

# Копировать в ssl директорию
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/server.crt
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/server.key
sudo chmod 600 ssl/server.key

# Настроить auto-renewal
sudo certbot renew --dry-run
```

## Troubleshooting

### Порт уже занят

```bash
# Найти процесс на порту
sudo lsof -i :7070
sudo ss -tuln | grep 7070

# Изменить порт в docker-compose.yml
ports:
  - "7071:7070"
```

### Контейнер падает

```bash
# Проверить логи
docker compose logs kiosk-agent

# Проверить ресурсы
docker stats

# Войти в контейнер
docker compose exec kiosk-agent sh

# Проверить health
docker inspect kiosk-agent | grep Health -A 10
```

### Проблемы с сетью

```bash
# Список сетей
docker network ls

# Инспекция сети
docker network inspect kiosk_kiosk-network

# Пересоздать сеть
docker compose down
docker network prune
docker compose up -d
```

### Permission denied

```bash
# Проверить владельца volumes
docker volume inspect kiosk-data

# Исправить права в контейнере
docker compose exec -u root kiosk-agent chown -R kiosk:kiosk /app/data
```

## Production рекомендации

1. **Security:**
   - Используйте настоящие SSL сертификаты
   - Измените пароли по умолчанию
   - Ограничьте доступ к Prometheus/Grafana через firewall
   - Используйте secrets для sensitive данных

2. **Monitoring:**
   - Настройте алерты в Alertmanager
   - Создайте дашборды в Grafana
   - Настройте retention для метрик
   - Мониторьте disk usage для volumes

3. **Backup:**
   - Регулярно бэкапьте volumes
   - Тестируйте восстановление из бэкапов
   - Храните бэкапы в отдельном месте

4. **Performance:**
   - Настройте resource limits для контейнеров
   - Используйте Docker BuildKit для faster builds
   - Включите logging driver для централизованных логов

5. **Updates:**
   - Регулярно обновляйте базовые образы
   - Тестируйте обновления на staging
   - Держите rollback план

## Интеграция с CI/CD

См. `.github/workflows/agent-ci.yml` и `agent-cd.yml` для примеров CI/CD пайплайнов.

Docker образы автоматически публикуются в GitHub Container Registry:
```
ghcr.io/innoscripts2/my-own-service/kiosk-agent:latest
ghcr.io/innoscripts2/my-own-service/kiosk-agent:main
ghcr.io/innoscripts2/my-own-service/kiosk-agent:v1.0.0
```

Pull образ:
```bash
docker pull ghcr.io/innoscripts2/my-own-service/kiosk-agent:latest
```

## Дополнительная информация

- Deployment guide: `../../docs/tech/deployment.md`
- Monitoring guide: `../monitoring/README.md`
- Agent documentation: `../../apps/kiosk-agent/README.md`
