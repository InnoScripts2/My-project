# Reports System

Система генерации, хранения и доставки отчётов для киоска самообслуживания.

## Архитектура

Модуль отчётов состоит из следующих компонентов:

### ReportService

Центральный сервис для управления отчётами. Предоставляет методы:

- `generateReport(sessionId, type, data)` - генерация отчёта из данных сессии
- `getReport(reportId)` - получение отчёта по ID
- `previewReport(reportId)` - получение HTML содержимого для предпросмотра
- `sendReport(reportId, delivery)` - отправка отчёта по email или SMS
- `cleanup()` - очистка истёкших отчётов (TTL 24 часа)

### Типы отчётов

- `THICKNESS` - толщинометрия ЛКП
- `DIAGNOSTICS` - диагностика OBD-II

### Компоненты

#### Builder
Генерация HTML и PDF из данных отчёта:
- `buildHtml(data)` - HTML генерация через @selfservice/report
- `buildPdf(data)` - PDF генерация через Puppeteer (с fallback в DEV)

#### Storage Adapter
Локальное файловое хранилище:
- Сохранение HTML и PDF файлов
- Получение URL для доступа
- Удаление файлов

#### Mailer Adapter
Отправка email:
- Retry с exponential backoff (3 попытки: 2s, 4s, 8s)
- Rate limiting: максимум 10 email за час
- Валидация email формата
- DEV режим: только логирование

#### SMS Adapter
Отправка SMS:
- Retry с exponential backoff (3 попытки)
- Rate limiting: максимум 10 SMS за час
- Валидация телефонного номера
- Обрезка сообщений до 160 символов
- DEV режим: только логирование

#### PDF Generator
Генерация PDF из HTML:
- Puppeteer для PROD (A4, margins 10mm)
- Fallback генератор для DEV (HTML as bytes)
- Автоматическая проверка доступности Chrome

### Cleanup Task
Автоматическая очистка истёкших отчётов:
- Запуск каждый час
- Удаление отчётов старше 24 часов
- Логирование количества удалённых файлов

## REST API

### POST /api/reports/generate
Генерация отчёта.

**Request:**
```json
{
  "sessionId": "session-123",
  "type": "THICKNESS" | "DIAGNOSTICS",
  "data": { /* ThicknessReportData | ObdReportData */ }
}
```

**Response:**
```json
{
  "ok": true,
  "reportId": "uuid",
  "type": "THICKNESS",
  "generatedAt": "2024-01-01T12:00:00Z",
  "expiresAt": "2024-01-02T12:00:00Z"
}
```

### GET /api/reports/:reportId/preview
Предпросмотр HTML отчёта.

**Response:** HTML содержимое (Content-Type: text/html)

### GET /api/reports/:reportId/download
Скачивание PDF отчёта.

**Response:** PDF файл (Content-Type: application/pdf, Content-Disposition: attachment)

### POST /api/reports/:reportId/send
Отправка отчёта на email или SMS.

**Request:**
```json
{
  "channel": "EMAIL" | "SMS",
  "recipient": "email@example.com" | "+79991234567",
  "language": "ru"
}
```

**Response:**
```json
{
  "ok": true,
  "success": true,
  "channel": "EMAIL",
  "recipient": "email@example.com",
  "sentAt": "2024-01-01T12:00:00Z",
  "error": null
}
```

## Метрики Prometheus

- `report_generated_total` - количество сгенерированных отчётов (labels: type, status)
- `report_delivered_total` - количество доставленных отчётов (labels: channel, status)
- `report_generation_duration_seconds` - длительность генерации (labels: type)
- `reports_build_html_duration_seconds` - длительность сборки HTML (labels: type)
- `reports_build_pdf_duration_seconds` - длительность сборки PDF (labels: type)
- `reports_mailer_success_total` - успешные email отправки
- `reports_mailer_error_total` - неудачные email отправки
- `reports_sms_success_total` - успешные SMS отправки
- `reports_sms_error_total` - неудачные SMS отправки

## Конфигурация

### Переменные окружения

```bash
# Директория для хранения отчётов
REPORTS_DIR=./reports

# SMTP настройки (опционально для DEV)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=noreply@example.com
SMTP_USER=username
SMTP_PASS=password
SMTP_SECURE=false

# SMS настройки (опционально для DEV)
SMS_API_KEY=your-api-key
SMS_SENDER_ID=YourSender
SMS_API_URL=https://api.sms-provider.com

# Базовый URL киоска (для ссылок в SMS)
KIOSK_BASE_URL=http://localhost:7070

# Окружение (DEV/PROD)
AGENT_ENV=DEV

# ID киоска (для rate limiting)
KIOSK_ID=kiosk-1
```

## Примеры использования

### Генерация отчёта

```typescript
import { reportService, ReportType } from './reports/service.js'

const data: ThicknessReportData = {
  sessionId: 'session-123',
  contact: { email: 'client@example.com' },
  points: [
    { id: '1', label: 'Капот', valueMicrons: 120 },
    { id: '2', label: 'Крыша', valueMicrons: 100 }
  ],
  summary: 'Все измерения в норме'
}

const report = await reportService.generateReport(
  'session-123',
  ReportType.THICKNESS,
  data
)

console.log('Report ID:', report.reportId)
```

### Предпросмотр

```typescript
const html = await reportService.previewReport(report.reportId)
// Отправить HTML клиенту для отображения в iframe
```

### Отправка на email

```typescript
import { DeliveryChannel } from './reports/service.js'

const result = await reportService.sendReport(report.reportId, {
  channel: DeliveryChannel.EMAIL,
  recipient: 'client@example.com',
  language: 'ru'
})

if (result.success) {
  console.log('Email sent successfully')
} else {
  console.error('Email failed:', result.error)
}
```

### Отправка SMS

```typescript
const result = await reportService.sendReport(report.reportId, {
  channel: DeliveryChannel.SMS,
  recipient: '+79991234567',
  language: 'ru'
})
```

## Безопасность

- Персональные данные хранятся только 24 часа
- Email/phone валидируются перед отправкой
- Rate limiting защищает от спама (10 отправок/час)
- Retry механизм с exponential backoff
- Секреты (SMTP, SMS credentials) в ENV

## Тестирование

Запуск тестов:

```bash
npm test
```

Тесты покрывают:
- Генерация отчётов (HTML/PDF)
- Получение и предпросмотр отчётов
- Отправка по email и SMS
- Cleanup истёкших отчётов
- PDF генерация с Puppeteer и fallback

## Troubleshooting

### PDF генерация не работает

**Проблема:** Puppeteer не может найти Chrome.

**Решение:** 
- В DEV: используется fallback (HTML as bytes)
- В PROD: установить Chrome или Chromium:
  ```bash
  # Ubuntu/Debian
  apt-get install chromium-browser
  
  # Windows
  # Chrome устанавливается автоматически при установке Puppeteer
  ```

### Email/SMS не отправляются

**Проблема:** Нет конфигурации провайдера.

**Решение:**
- В DEV: сообщения логируются, реальная отправка не происходит
- В PROD: настроить SMTP_HOST, SMTP_USER, SMTP_PASS или интеграцию с Edge Function

### Rate limit exceeded

**Проблема:** Превышен лимит отправок.

**Решение:** Подождать 1 час или увеличить лимит в коде (RateLimiter конструктор)

## Roadmap

- [ ] Multi-language поддержка (en, ru)
- [ ] Кастомизация брендинга (логотип, цвета)
- [ ] Графики и диаграммы в отчётах
- [ ] SendGrid и Twilio интеграции для PROD
- [ ] Поддержка шаблонов через Handlebars
- [ ] QR коды для повторного доступа к отчёту
- [ ] Webhook нотификации при генерации
