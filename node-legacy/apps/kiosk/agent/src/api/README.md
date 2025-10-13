# Core Services Module

Центральный модуль для управления сессиями, платежами, отчетами и метриками киоск-агента.

## Компоненты

### SessionManager
Управление сессиями клиентов с автоматическим таймаутом и персистентностью в SQLite.

**Особенности:**
- Автоматический таймаут неактивных сессий
- Хранение в SQLite с миграциями
- Поддержка различных типов сессий (толщинометрия, диагностика)
- Автоматическая очистка истекших сессий

### PaymentService
Интеграция платежей с поддержкой DEV и PROD режимов.

**Особенности:**
- DEV режим: эмулятор с автоподтверждением (2 секунды)
- PROD режим: интеграция с YooKassa
- Webhook обработка для PSP
- Персистентность в SQLite
- Автоматическая очистка истекших платежей

### ReportService
Генерация и доставка PDF отчетов.

**Особенности:**
- Генерация PDF через pdfkit
- Доставка через email (SMTP/SendGrid)
- Уведомления через SMS (Twilio/SMSC)
- Хранение метаданных в SQLite
- Файловое хранилище для PDF

### MetricsService
Экспорт Prometheus метрик для мониторинга.

**Метрики:**
- Платежи: создание, подтверждение, ошибки, длительность
- Сессии: создание, завершение, истечение, длительность
- Диагностика: сканирования, найденные DTC, длительность
- Отчеты: генерация, доставка, ошибки

## Использование

### Инициализация

```typescript
import { initializeCoreServices } from './api/core-services.js';

const services = initializeCoreServices({
  environment: process.env.AGENT_ENV === 'PROD' ? 'PROD' : 'DEV',
  storagePath: './storage',
  reportsPath: './storage/reports',
});

// Подключить роутеры к Express app
app.use(services.createRouter());
```

### Создание сессии

```typescript
const session = await services.sessionManager.createSession({
  type: 'diagnostics',
  contact: {
    email: 'client@example.com',
    phone: '+79001234567',
  },
  metadata: {
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
  },
  ttlMs: 3600000, // 1 hour
});
```

### Создание платежа

```typescript
const payment = await services.paymentService.createIntent({
  amount: 48000, // 480 RUB (в копейках)
  currency: 'RUB',
  sessionId: session.id,
  metadata: {
    service: 'diagnostics',
  },
});

// Отображение QR кода клиенту
console.log('QR Data:', payment.qrCodeData);
```

### Генерация отчета

```typescript
const report = await services.reportService.generateAndDeliverDiagnosticsReport(
  {
    sessionId: session.id,
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    dtcCodes: [
      {
        code: 'P0420',
        description: 'Catalyst System Efficiency Below Threshold',
        severity: 'medium',
      },
    ],
    timestamp: new Date().toISOString(),
  },
  {
    email: 'client@example.com',
    phone: '+79001234567',
  }
);
```

### Получение метрик

```typescript
// Метрики доступны через HTTP endpoint
GET /metrics

// Или программно
const metrics = await services.metricsService.getMetrics();
console.log(metrics);
```

## API Endpoints

### Sessions
- `POST /api/sessions` - Создать сессию
- `GET /api/sessions/:id` - Получить сессию
- `PATCH /api/sessions/:id` - Обновить сессию
- `POST /api/sessions/:id/complete` - Завершить сессию
- `GET /api/sessions` - Список сессий

### Payments
- `POST /api/payments/intent` - Создать платежное намерение
- `GET /api/payments/status/:id` - Статус платежа
- `GET /api/payments/intent/:id` - Детали платежа
- `POST /api/payments/confirm/:id` - Подтвердить (DEV only)
- `POST /api/payments/webhook` - Webhook от PSP

### Reports
- `POST /api/reports/diagnostics` - Отчет диагностики
- `POST /api/reports/thickness` - Отчет толщинометрии
- `GET /api/reports/:id` - Получить отчет
- `GET /api/reports/session/:id` - Отчеты по сессии

### Metrics
- `GET /metrics` - Prometheus метрики

## Конфигурация

### Переменные окружения

```bash
# Базовые настройки
AGENT_ENV=DEV                           # DEV или PROD

# Платежи (YooKassa)
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_xxx
YOOKASSA_WEBHOOK_URL=https://domain.com/api/payments/webhook

# Email
EMAIL_PROVIDER=smtp                     # smtp, sendgrid, или dev
EMAIL_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SENDGRID_API_KEY=SG.xxx

# SMS
SMS_PROVIDER=twilio                     # twilio, smsc, или dev
SMS_FROM=+79000000000
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
```

### Файл конфигурации

`config/service.json` содержит настройки по умолчанию:

```json
{
  "environment": "DEV",
  "payments": {
    "provider": "dev",
    "dev": {
      "autoConfirmDelayMs": 2000,
      "manualMode": false
    }
  },
  "sessions": {
    "defaultTtlMs": 3600000,
    "autoResetOnTimeout": true
  }
}
```

## Хранилище

### База данных

`storage/core.sqlite` содержит таблицы:
- `sessions` - сессии клиентов
- `payments` - записи платежей
- `reports` - метаданные отчетов
- `audit_logs` - журнал аудита

### Миграции

Миграции применяются автоматически при старте.

Файлы: `migrations/001_initial_schema.sql`

### Файлы

- `storage/reports/*.pdf` - сгенерированные отчеты

## Тестирование

```bash
# Запустить все тесты
npm test

# Запустить тесты конкретного модуля
npm test -- src/sessions/manager.test.ts
npm test -- src/api/services/payments.test.ts
npm test -- src/api/core-services.test.ts
```

## Мониторинг

### Prometheus метрики

Подключите Prometheus к `/metrics` endpoint:

```yaml
scrape_configs:
  - job_name: 'kiosk-agent'
    static_configs:
      - targets: ['localhost:7070']
```

### Grafana дашборды

Рекомендуемые панели:
1. Активные сессии (gauge)
2. Успешные платежи за час (counter rate)
3. Средняя длительность диагностики (histogram)
4. Rate неудачных доставок отчетов (counter rate)

### Алерты

Пример алертов в Prometheus:

```yaml
groups:
  - name: kiosk-agent
    rules:
      - alert: HighPaymentFailureRate
        expr: rate(payments_failed_total[5m]) / rate(payments_intents_total[5m]) > 0.1
        annotations:
          summary: "Высокий процент неудачных платежей"
```

## Разработка

### Добавление нового типа отчета

1. Создать генератор в `packages/reporting/src/`
2. Добавить метод в `ReportService`
3. Создать endpoint в `routes/reports.ts`
4. Обновить метрики в `services/metrics.ts`

### Добавление нового PSP

1. Создать адаптер в `services/payment-providers/`
2. Реализовать методы `createPayment`, `getPaymentStatus`, `processWebhook`
3. Добавить конфигурацию в `CoreServices`
4. Обновить документацию

## Безопасность

- Все секреты в переменных окружения
- Валидация webhook подписей
- Rate limiting на API endpoints
- Маскирование PII в логах
- Аудит всех критичных операций

## Поддержка

- Документация: `/docs/backoffice.md`
- GitHub Issues: https://github.com/InnoScripts2/my-own-service/issues
