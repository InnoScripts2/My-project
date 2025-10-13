# Deployment Guide — Cycle 1 Integration

Пошаговое руководство по развёртыванию полностью интегрированной системы.

## Предварительные требования

### Инструменты

- Node.js 18+ и npm
- Supabase CLI: `npm install -g supabase`
- Android Studio (для APK)
- PowerShell 7+ (для скриптов Windows)

### Учётные записи

- Supabase Project (https://supabase.com)
- Email provider (для отправки отчётов)
- SMS provider (опционально)
- Payment provider (на ранних этапах — имитация)

## Шаг 1: Настройка Supabase

### 1.1 Создание проекта

1. Зайти в https://app.supabase.com
2. Создать новый проект
3. Записать:
   - Project URL: `https://<project-id>.supabase.co`
   - `anon` key (для фронтенда)
   - `service_role` key (для бэкенда)

### 1.2 Применение миграций

```bash
# Клонировать репозиторий
git clone https://github.com/InnoScripts2/my-own-service.git
cd my-own-service

# Подключиться к проекту
supabase link --project-ref <your-project-ref>

# Применить все миграции
supabase db push

# Проверить статус
supabase db diff
```

**Миграции должны включать:**
- `20251002101636_*` — AI conversations
- `20251002103431_*` — основные таблицы (sessions, payments, reports и т.д.)
- `20251003020604_*` — дополнительные таблицы
- `20251004000000_*` — RLS policies
- `20251005000000_*` — индексы производительности
- `20250106000000_*` — webhook_events и RPC

### 1.3 Создание Storage Bucket

```bash
# В Supabase Dashboard: Storage → New bucket
# Имя: reports
# Public: false (используем signed URLs)
```

Или через CLI:
```bash
supabase storage create reports --public false
```

### 1.4 Deployment Edge Functions

```bash
# Webhook для платежей
supabase functions deploy payments-webhook --no-verify-jwt

# AI чат (опционально)
supabase functions deploy ai-chat --no-verify-jwt
```

### 1.5 Настройка Secrets

В Supabase Dashboard → Project Settings → Functions → Secrets:

```env
PROVIDER_WEBHOOK_SECRET=<generate-strong-secret>
```

Генерация секрета:
```bash
openssl rand -hex 32
```

### 1.6 Webhook URL

Webhook URL для провайдера платежей:
```
https://<project-id>.supabase.co/functions/v1/payments-webhook
```

**HMAC подпись:**
- Algorithm: SHA-256
- Header: `x-provider-signature`
- Body: raw JSON string

## Шаг 2: Настройка Agent (Local)

### 2.1 Установка зависимостей

```bash
cd apps/kiosk-agent
npm install
```

### 2.2 Конфигурация .env

Создать `.env` в корне проекта:

```env
# Environment
AGENT_ENV=DEV
AGENT_PERSISTENCE=supabase
AGENT_PORT=7070

# Supabase
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>

# OBD-II Configuration
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_CONNECT_MAX_DELAY_MS=30000
OBD_INIT_MAX_ATTEMPTS=3
OBD_OPERATION_MAX_ATTEMPTS=3

# Email (опционально для DEV)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SMS (опционально)
# SMS_PROVIDER=twilio
# SMS_API_KEY=...

# Logging
LOG_MAX_ENTRIES=10000
LOG_ENABLE_CONSOLE=true
LOG_MIN_LEVEL=info
```

### 2.3 Сборка и запуск

```bash
# Сборка
npm run build

# Запуск в DEV
npm run dev

# Или через скрипт
node server.cjs
```

Agent будет доступен на `http://localhost:7070`

### 2.4 Проверка health

```bash
curl http://localhost:7070/health
# Ожидается: {"ok":true,"state":"..."}

curl http://localhost:7070/health/integrations
# Проверяет Supabase, OBD, Thickness
```

## Шаг 3: Настройка Cloud API

### 3.1 Установка зависимостей

```bash
cd apps/cloud-api
npm install
```

### 3.2 Конфигурация .env

Создать `.env` в `apps/cloud-api/`:

```env
# Supabase
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Admin access
ADMIN_EMAILS=admin@example.com,support@example.com

# CORS
CLOUD_API_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:7070

# Rate limiting
CLOUD_API_RATE_LIMIT_MAX=100
CLOUD_API_RATE_LIMIT_WINDOW_MS=60000
```

### 3.3 Запуск

```bash
# Development
npm run dev
# Доступен на http://localhost:7071

# Production build
npm run build
npm run start
```

### 3.4 Проверка health

```bash
curl http://localhost:7071/health
# Ожидается: {"ok":true}

curl http://localhost:7071/readiness
# Проверяет Supabase connection
```

## Шаг 4: Настройка Frontend

### 4.1 Статический сервер для DEV

```bash
# В корне проекта
npm run static
# Доступен на http://localhost:8080
```

### 4.2 Конфигурация AGENT_API_BASE

Frontend автоматически определяет Agent API:

**Через URL параметр:**
```
http://localhost:8080/?agent=http://localhost:7070
```

**Через localStorage:**
```javascript
localStorage.setItem('agentApiBase', 'http://localhost:7070')
```

**Default fallback:**
- Пробует `http://localhost:7070`
- Если не доступен, показывает ошибку

### 4.3 Service Worker

Service Worker регистрируется автоматически при загрузке `index.html`.

**Проверка:**
1. Открыть DevTools → Application → Service Workers
2. Должен быть активный worker `service-worker.js`
3. Проверить Cache Storage → `kiosk-shell-v2`

**Runtime commands:**
```javascript
// Skip waiting (обновить SW немедленно)
navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })

// Cache icons
navigator.serviceWorker.controller.postMessage({ type: 'CACHE_ICONS' })

// Clear cache
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })

// Get version
navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' })
```

### 4.4 Offline testing

1. Открыть DevTools → Network → Offline
2. Обновить страницу
3. Должен показаться `/offline.html`
4. Включить сеть → автоматический редирект на главную

## Шаг 5: Сборка Android APK

### 5.1 Проверка Prerequisites

```bash
npm run apk:doctor
```

Должны быть установлены:
- Android SDK (API 34)
- Build Tools
- Platform Tools
- Command-line Tools

### 5.2 Настройка kiosk_url

Отредактировать `apps/android-kiosk/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">Киоск</string>
    <string name="kiosk_url">http://YOUR_FRONTEND_URL/</string>
</resources>
```

**Примеры:**
- Development: `http://192.168.1.100:8080/`
- Production: `https://kiosk.example.com/`

### 5.3 Сборка Debug APK

```bash
npm run apk:build
```

APK будет в `apps/android-kiosk/app/build/outputs/apk/debug/app-debug.apk`

### 5.4 Сборка Release APK

**Создать keystore:**
```bash
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias release
```

**Настроить signing в `gradle.properties`:**
```properties
RELEASE_STORE_FILE=../../../release-key.jks
RELEASE_KEY_ALIAS=release
RELEASE_STORE_PASSWORD=your-password
RELEASE_KEY_PASSWORD=your-password
```

**Собрать:**
```bash
npm run apk:build:release
```

APK будет в `apps/android-kiosk/app/build/outputs/apk/release/app-release.apk`

### 5.5 Установка на устройство

```bash
adb install apps/android-kiosk/app/build/outputs/apk/debug/app-debug.apk
```

Или перенести APK на устройство и установить вручную.

## Шаг 6: Комплексная проверка

### 6.1 DEV режим (все компоненты локально)

**Запустить все сервисы:**

```bash
# Terminal 1: Agent
npm run agent

# Terminal 2: Cloud API
npm run cloud-api

# Terminal 3: Frontend
npm run static
```

**Открыть в браузере:**
```
http://localhost:8080/?agent=http://localhost:7070
```

### 6.2 Тест OBD Flow

1. Выбрать "Диагностика OBD-II"
2. Выбрать автомобиль (Toyota/Lexus)
3. Agent → автоопределение адаптера
4. Чтение DTC кодов
5. Отображение результатов
6. Имитация оплаты (DEV)
7. Генерация отчёта
8. Отправка отчёта на email

**Ожидаемые логи в Agent:**
```
[OBD] Connecting...
[OBD] Adapter found on COM3 (or Bluetooth)
[OBD] Protocol: ISO 15765-4
[OBD] Reading DTC codes...
[OBD] Found 2 codes: P0420, P0171
[Report] Generating report...
[Report] Saved to Supabase Storage
[Email] Sent to user@example.com
```

### 6.3 Тест Offline Mode

1. Открыть DevTools → Network → Online
2. Загрузить приложение
3. Переключить → Offline
4. Обновить страницу
5. Должен показаться `offline.html`
6. Автоматическая проверка соединения каждые 5 секунд
7. Переключить → Online
8. Автоматический редирект на главную

### 6.4 Тест Payment Webhook

**Отправить test webhook:**

```bash
# Сгенерировать HMAC подпись
SECRET="your-webhook-secret"
PAYLOAD='{"event_type":"payment.succeeded","payment_id":"test_123","status":"succeeded","amount":480}'

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST "https://<project-id>.supabase.co/functions/v1/payments-webhook" \
  -H "Content-Type: application/json" \
  -H "x-provider-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "event_id": "uuid",
  "message": "Webhook processed successfully"
}
```

**Проверить в Supabase:**
```sql
-- Webhook events
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;

-- Payment status
SELECT * FROM payments WHERE intent_id = 'test_123';
```

### 6.5 Тест Android Bluetooth

1. Установить APK на устройство
2. Запустить приложение
3. Должен показаться explanation dialog
4. Нажать "Разрешить"
5. System permission dialog → Grant
6. WebView загружает kiosk_url
7. Выбрать "Диагностика OBD-II"
8. Agent → Bluetooth scan
9. Найти адаптер → подключиться

**Примечание:** Требуется реальный OBD-II адаптер для полного теста.

## Шаг 7: Production Deployment

### 7.1 Environment Variables

**Agent (production server):**
```env
AGENT_ENV=PROD
AGENT_PERSISTENCE=supabase
AGENT_PORT=7070

SUPABASE_URL=https://<prod-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>

# Отключить dev-only features
# No SMTP config → email не работает (используйте Cloud API)
```

**Cloud API (production):**
```env
SUPABASE_URL=https://<prod-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key>

ADMIN_EMAILS=admin@company.com

CLOUD_API_ALLOWED_ORIGINS=https://kiosk.example.com

# Production SMTP
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
```

**Supabase Functions (production):**
```env
PROVIDER_WEBHOOK_SECRET=<strong-prod-secret>
```

### 7.2 Frontend Deployment

**Static hosting options:**
- Vercel: `vercel deploy apps/kiosk-frontend`
- Netlify: drag & drop `apps/kiosk-frontend/`
- GitHub Pages
- S3 + CloudFront
- Nginx на собственном сервере

**ВАЖНО:** Настроить CORS на Agent и Cloud API для production домена.

### 7.3 Agent Deployment

**Options:**
1. **PM2 (рекомендуется для Node.js):**
   ```bash
   npm install -g pm2
   pm2 start apps/kiosk-agent/server.cjs --name kiosk-agent
   pm2 save
   pm2 startup
   ```

2. **Systemd service:**
   ```ini
   [Unit]
   Description=Kiosk Agent
   After=network.target

   [Service]
   Type=simple
   User=kiosk
   WorkingDirectory=/opt/kiosk-agent
   ExecStart=/usr/bin/node server.cjs
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

3. **Docker:**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY apps/kiosk-agent/package*.json ./
   RUN npm ci --production
   COPY apps/kiosk-agent/ ./
   EXPOSE 7070
   CMD ["node", "server.cjs"]
   ```

### 7.4 Cloud API Deployment

Аналогично Agent, но на порту 7071.

**Или deploy на Vercel/Railway/Render:**
```bash
cd apps/cloud-api
vercel deploy --prod
```

### 7.5 Мониторинг

**Prometheus metrics:**
- Agent: `http://agent-host:7070/metrics`
- Cloud API: `http://cloud-host:7071/metrics`

**Health checks:**
- Agent: `http://agent-host:7070/health`
- Cloud API: `http://cloud-host:7071/health`

**Supabase Dashboard:**
- Database → Logs
- Storage → Reports bucket usage
- Functions → payments-webhook logs

### 7.6 SSL/TLS

**Рекомендация:** Использовать reverse proxy (Nginx/Caddy) с Let's Encrypt:

```nginx
server {
    listen 443 ssl http2;
    server_name kiosk.example.com;

    ssl_certificate /etc/letsencrypt/live/kiosk.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kiosk.example.com/privkey.pem;

    location / {
        root /var/www/kiosk-frontend;
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 443 ssl http2;
    server_name api.kiosk.example.com;

    ssl_certificate /etc/letsencrypt/live/api.kiosk.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.kiosk.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:7070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Шаг 8: Troubleshooting

### Agent не подключается к OBD

1. Проверить доступность COM-порта:
   ```bash
   curl http://localhost:7070/api/serialports
   ```

2. Проверить драйверы адаптера (Windows: Device Manager)

3. Проверить логи:
   ```bash
   # Если используется PM2
   pm2 logs kiosk-agent
   ```

4. Попробовать manual connect:
   ```bash
   curl -X POST http://localhost:7070/api/obd/open \
     -H "Content-Type: application/json" \
     -d '{"options":{"transport":"serial","portPath":"COM3"}}'
   ```

### Frontend не может подключиться к Agent

1. Проверить CORS settings в Agent
2. Проверить `agentApiBase` в localStorage
3. Проверить URL параметр `?agent=...`
4. Открыть DevTools → Network → проверить failed requests

### Webhook не работает

1. Проверить HMAC подпись:
   ```bash
   # Test без подписи (DEV mode only)
   curl -X POST "https://<project>.supabase.co/functions/v1/payments-webhook" \
     -H "Content-Type: application/json" \
     -d '{"event_type":"payment.test","payment_id":"test","status":"succeeded"}'
   ```

2. Проверить логи в Supabase Dashboard → Functions → payments-webhook

3. Проверить `PROVIDER_WEBHOOK_SECRET` установлен

### Reports не сохраняются

1. Проверить наличие bucket `reports`:
   ```bash
   supabase storage list
   ```

2. Проверить permissions на bucket (должен быть accessible by service_role)

3. Проверить `SUPABASE_SERVICE_ROLE_KEY` установлен в Cloud API

### Android APK не загружает страницу

1. Проверить `kiosk_url` в `strings.xml`
2. Проверить network security config для HTTP (если не HTTPS)
3. Проверить логи в Android Studio Logcat:
   ```bash
   adb logcat | grep "KioskMainActivity"
   ```

## Приложение: Скрипты автоматизации

### auto-deploy.sh (Linux/macOS)

```bash
#!/bin/bash
set -e

echo "=== Kiosk Deployment Script ==="

# 1. Pull latest code
echo "Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "Installing dependencies..."
npm install
cd apps/kiosk-agent && npm install && cd ../..
cd apps/cloud-api && npm install && cd ../..

# 3. Run tests
echo "Running tests..."
npm run test:all

# 4. Run linters
echo "Running linters..."
npm run lint

# 5. Build agent
echo "Building agent..."
cd apps/kiosk-agent && npm run build && cd ../..

# 6. Build cloud-api
echo "Building cloud-api..."
cd apps/cloud-api && npm run build && cd ../..

# 7. Restart services
echo "Restarting services..."
pm2 restart kiosk-agent
pm2 restart cloud-api

echo "=== Deployment complete! ==="
```

### deploy-supabase.sh

```bash
#!/bin/bash
set -e

echo "=== Deploying Supabase Functions ==="

# Deploy functions
supabase functions deploy payments-webhook --no-verify-jwt
supabase functions deploy ai-chat --no-verify-jwt

# Apply migrations
supabase db push

echo "=== Supabase deployment complete! ==="
```

## Контакты и поддержка

При возникновении проблем обратитесь к:
- `docs/internal/INTEGRATION_VERIFICATION.md` — чек-лист интеграции
- `docs/tech/QUICKSTART_INTEGRATION.md` — quick start guide
- GitHub Issues: https://github.com/InnoScripts2/my-own-service/issues
