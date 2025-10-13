# Kiosk Agent - Startup Guide

Руководство по запуску и настройке киоск-агента с новыми core services.

## Быстрый старт (DEV)

### 1. Установка зависимостей

```bash
# Установить зависимости для всех workspace
npm install

# Или только для kiosk-agent
cd apps/kiosk-agent
npm install
```

### 2. Конфигурация

Создать `.env` файл в корне проекта на основе `.env.example`:

```bash
cp .env.example .env
```

Минимальная конфигурация для DEV:

```env
AGENT_ENV=DEV
AGENT_PORT=7070
EMAIL_PROVIDER=dev
SMS_PROVIDER=dev
```

### 3. Инициализация базы данных

База данных SQLite создается автоматически при первом запуске.

Расположение: `apps/kiosk-agent/storage/core.sqlite`

Миграции применяются автоматически.

### 4. Запуск

```bash
# Из корня проекта
npm run dev

# Или только kiosk-agent
cd apps/kiosk-agent
npm run dev
```

Агент будет доступен на `http://localhost:7070`

### 5. Проверка работоспособности

```bash
# Проверить API
curl http://localhost:7070/metrics

# Создать тестовую сессию
curl -X POST http://localhost:7070/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "diagnostics",
    "contact": {"email": "test@example.com"}
  }'

# Создать тестовый платеж
curl -X POST http://localhost:7070/api/payments/intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 48000,
    "currency": "RUB"
  }'
```

## Production Deployment

### 1. Конфигурация

Установить все необходимые переменные окружения:

```env
AGENT_ENV=PROD
AGENT_PORT=7070

# YooKassa
YOOKASSA_SHOP_ID=your-shop-id
YOOKASSA_SECRET_KEY=your-secret-key
YOOKASSA_WEBHOOK_URL=https://your-domain.com/api/payments/webhook

# Email (SMTP или SendGrid)
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@yourdomain.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password

# SMS (опционально)
SMS_PROVIDER=twilio
SMS_FROM=+79000000000
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
```

### 2. Сборка

```bash
cd apps/kiosk-agent
npm run build
```

Результат сборки: `apps/kiosk-agent/dist/`

### 3. Запуск в Production

```bash
cd apps/kiosk-agent
NODE_ENV=production npm start
```

### 4. Process Manager (PM2)

Рекомендуется использовать PM2 для управления процессом:

```bash
# Установить PM2
npm install -g pm2

# Создать конфигурацию PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'kiosk-agent',
    script: './dist/index.js',
    cwd: './apps/kiosk-agent',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      AGENT_ENV: 'PROD',
      AGENT_PORT: 7070
    }
  }]
}
EOF

# Запустить через PM2
pm2 start ecosystem.config.js

# Сохранить конфигурацию для автозапуска
pm2 save
pm2 startup
```

### 5. Nginx reverse proxy

Пример конфигурации Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:7070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 6. SSL/TLS (Let's Encrypt)

```bash
# Установить certbot
sudo apt-get install certbot python3-certbot-nginx

# Получить сертификат
sudo certbot --nginx -d your-domain.com

# Автообновление
sudo certbot renew --dry-run
```

## Docker Deployment

### Dockerfile

Создать `apps/kiosk-agent/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Копировать package files
COPY package*.json ./
COPY apps/kiosk-agent/package*.json ./apps/kiosk-agent/
COPY packages/reporting/package*.json ./packages/reporting/

# Установить зависимости
RUN npm install --production

# Копировать исходники
COPY apps/kiosk-agent ./apps/kiosk-agent
COPY packages/reporting ./packages/reporting

# Собрать reporting package
WORKDIR /app/packages/reporting
RUN npm run build

# Собрать kiosk-agent
WORKDIR /app/apps/kiosk-agent
RUN npm run build

# Создать директории для storage
RUN mkdir -p storage/reports

EXPOSE 7070

CMD ["npm", "start"]
```

### Docker Compose

Создать `docker-compose.yml`:

```yaml
version: '3.8'

services:
  kiosk-agent:
    build:
      context: .
      dockerfile: apps/kiosk-agent/Dockerfile
    ports:
      - "7070:7070"
    environment:
      - AGENT_ENV=PROD
      - AGENT_PORT=7070
      - YOOKASSA_SHOP_ID=${YOOKASSA_SHOP_ID}
      - YOOKASSA_SECRET_KEY=${YOOKASSA_SECRET_KEY}
      - EMAIL_PROVIDER=smtp
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    volumes:
      - ./storage:/app/apps/kiosk-agent/storage
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

### Запуск через Docker

```bash
# Собрать и запустить
docker-compose up -d

# Проверить логи
docker-compose logs -f kiosk-agent

# Остановить
docker-compose down
```

## Monitoring Setup

### Prometheus

Создать `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kiosk-agent'
    static_configs:
      - targets: ['kiosk-agent:7070']
```

### Grafana Dashboards

1. Открыть Grafana: `http://localhost:3001`
2. Добавить Prometheus data source: `http://prometheus:9090`
3. Импортировать дашборд или создать новый

Рекомендуемые панели:
- Sessions: `sessions_active`, `sessions_created_total`
- Payments: `payments_confirmed_total`, `payments_failed_total`
- Diagnostics: `diagnostics_duration_seconds`
- Reports: `reports_delivered_total`

## Maintenance

### Backup

```bash
# Backup базы данных
sqlite3 apps/kiosk-agent/storage/core.sqlite ".backup backup-$(date +%Y%m%d).sqlite"

# Backup отчетов
tar -czf reports-backup-$(date +%Y%m%d).tar.gz apps/kiosk-agent/storage/reports/
```

### Cleanup

```bash
# Удалить старые отчеты (старше 30 дней)
find apps/kiosk-agent/storage/reports -type f -mtime +30 -delete

# Vacuum базы данных
sqlite3 apps/kiosk-agent/storage/core.sqlite "VACUUM"
```

### Logs

```bash
# PM2 logs
pm2 logs kiosk-agent

# Docker logs
docker-compose logs -f kiosk-agent

# Rotate logs (PM2)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Troubleshooting

### База данных заблокирована

```bash
# Проверить процессы
lsof apps/kiosk-agent/storage/core.sqlite

# Удалить lock файлы
rm -f apps/kiosk-agent/storage/core.sqlite-wal
rm -f apps/kiosk-agent/storage/core.sqlite-shm
```

### Платежи не работают

1. Проверить переменные окружения `YOOKASSA_*`
2. Проверить webhook URL доступен из интернета
3. Проверить логи: `grep payment /var/log/...`
4. Проверить метрики: `curl localhost:7070/metrics | grep payment`

### Email не отправляются

1. Проверить `EMAIL_PROVIDER` и соответствующие настройки
2. Проверить доступность SMTP хоста: `telnet smtp.example.com 587`
3. Для SendGrid: проверить API ключ
4. В DEV режиме: проверить логи

### Метрики недоступны

```bash
# Проверить доступность эндпоинта
curl http://localhost:7070/metrics

# Проверить Prometheus targets
# http://localhost:9090/targets
```

## Performance Tuning

### Node.js

```bash
# Увеличить heap memory
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Enable CPU profiling
NODE_OPTIONS="--prof" npm start
```

### SQLite

```bash
# В начале приложения
sqlite3 storage/core.sqlite << EOF
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;
EOF
```

### Nginx

```nginx
# Кэширование статики
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Сжатие
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

## Security Checklist

- [ ] Все секреты в переменных окружения
- [ ] HTTPS enabled (Let's Encrypt)
- [ ] Firewall настроен (только 80, 443, SSH)
- [ ] Rate limiting enabled
- [ ] CORS правильно настроен
- [ ] Регулярные backup
- [ ] Мониторинг и алерты настроены
- [ ] Логи ротируются
- [ ] OS и Node.js обновлены

## Support

- Документация: `apps/kiosk-agent/docs/backoffice.md`
- API Documentation: `apps/kiosk-agent/src/api/README.md`
- GitHub Issues: https://github.com/InnoScripts2/my-own-service/issues
