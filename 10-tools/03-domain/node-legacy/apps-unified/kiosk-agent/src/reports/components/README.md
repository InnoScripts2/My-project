# Report Components

Модуль генерации, хранения и доставки отчётов для киоск-агента.

## Компоненты

### builder.ts

Функции сборки HTML/PDF отчётов по данным сессии. Чистые функции без сетевых вызовов.

**Интерфейсы:**

- `buildHtml(sessionData: ThicknessReportData | ObdReportData): Promise<string>`
- `buildPdf(sessionData: ThicknessReportData | ObdReportData): Promise<Uint8Array>`

**Метрики Prometheus:**

- `reports_build_html_duration_seconds` - Время сборки HTML
- `reports_build_pdf_duration_seconds` - Время сборки PDF
- `reports_build_html_size_bytes` - Размер HTML отчётов
- `reports_build_pdf_size_bytes` - Размер PDF отчётов
- `reports_build_errors_total` - Количество ошибок сборки

**Пример:**

```typescript
import { buildHtml, buildPdf } from './components/builder.js'

const sessionData = {
  sessionId: 'sess-123',
  contact: { email: 'user@example.com' },
  points: [{ id: '1', label: 'Капот', valueMicrons: 120 }]
}

const html = await buildHtml(sessionData)
const pdf = await buildPdf(sessionData)
```

### storage-adapter.ts

Интерфейс и реализация записи/чтения PDF/HTML отчётов. Поддерживает локальную файловую систему с абстракцией под внешнее хранилище.

**Интерфейс StorageAdapter:**

- `put(key, content, format): Promise<string>` - Сохранить отчёт
- `getUrl(key, format): Promise<string>` - Получить URL к отчёту
- `delete(key, format): Promise<void>` - Удалить отчёт

**Реализации:**

- `LocalFileStorageAdapter` - Локальная файловая система
- `createStorageAdapter()` - Фабрика на основе `process.env`

**Переменные окружения:**

- `REPORTS_DIR` - Директория для хранения отчётов (по умолчанию `./reports`)

**Метрики:**

- `reports_storage_put_success_total` - Успешные сохранения
- `reports_storage_put_error_total` - Ошибки сохранения
- `reports_storage_delete_success_total` - Успешные удаления
- `reports_storage_delete_error_total` - Ошибки удаления

**Пример:**

```typescript
import { createStorageAdapter } from './components/storage-adapter.js'

const storage = createStorageAdapter()
const filePath = await storage.put('sess-123', htmlContent, 'html')
const url = await storage.getUrl('sess-123', 'html')
await storage.delete('sess-123', 'html')
```

### mailer-adapter.ts

Интерфейс отправки email с отчётами. В DEV режиме логирует payload, в PROD бросает `NotImplemented` (до интеграции с Edge Function).

**Интерфейс MailerAdapter:**

- `send(payload: MailPayload): Promise<void>`

**Реализации:**

- `DevMailerAdapter` - DEV-заглушка (логирование)
- `createMailerAdapter()` - Фабрика на основе `AGENT_ENV`

**Переменные окружения:**

- `SMTP_HOST` - SMTP хост
- `SMTP_PORT` - SMTP порт
- `SMTP_SECURE` - Использовать TLS (1/true)
- `SMTP_USER` - SMTP пользователь
- `SMTP_PASS` - SMTP пароль
- `SMTP_FROM` - Email отправителя
- `AGENT_ENV` - Окружение (DEV/PROD)

**Метрики:**

- `reports_mailer_success_total` - Успешные отправки
- `reports_mailer_error_total` - Ошибки отправки
- `reports_mailer_duration_seconds` - Время отправки

**Пример:**

```typescript
import { createMailerAdapter } from './components/mailer-adapter.js'

const mailer = createMailerAdapter()
await mailer.send({
  to: 'user@example.com',
  subject: 'Ваш отчёт готов',
  htmlBody: '<p>Отчёт во вложении</p>',
  attachmentPath: '/path/to/report.html'
})
```

### sms-adapter.ts

Интерфейс отправки SMS с информацией об отчёте. В DEV режиме логирует payload, в PROD бросает `NotImplemented` (до интеграции с Edge Function).

**Интерфейс SmsAdapter:**

- `send(payload: SmsPayload): Promise<void>`

**Реализации:**

- `DevSmsAdapter` - DEV-заглушка (логирование)
- `createSmsAdapter()` - Фабрика на основе `AGENT_ENV`

**Переменные окружения:**

- `SMS_API_KEY` - API ключ SMS провайдера
- `SMS_SENDER_ID` - ID отправителя
- `SMS_API_URL` - URL API (опционально)
- `AGENT_ENV` - Окружение (DEV/PROD)

**Метрики:**

- `reports_sms_success_total` - Успешные отправки
- `reports_sms_error_total` - Ошибки отправки
- `reports_sms_duration_seconds` - Время отправки

**Пример:**

```typescript
import { createSmsAdapter } from './components/sms-adapter.js'

const sms = createSmsAdapter()
await sms.send({
  to: '+79991234567',
  message: 'Ваш отчёт готов. Ссылка: https://...'
})
```

## Общий пример использования

```typescript
import { buildHtml, buildPdf } from './components/builder.js'
import { createStorageAdapter } from './components/storage-adapter.js'
import { createMailerAdapter } from './components/mailer-adapter.js'

async function generateAndSendReport(sessionData) {
  // Сборка
  const html = await buildHtml(sessionData)
  const pdf = await buildPdf(sessionData)
  
  // Сохранение
  const storage = createStorageAdapter()
  const htmlPath = await storage.put(sessionData.sessionId, html, 'html')
  const pdfPath = await storage.put(sessionData.sessionId, pdf, 'pdf')
  
  // Отправка
  const mailer = createMailerAdapter()
  await mailer.send({
    to: sessionData.contact.email,
    subject: 'Отчёт по услуге',
    htmlBody: '<p>Ваш отчёт во вложении</p>',
    attachmentPath: htmlPath
  })
}
```

