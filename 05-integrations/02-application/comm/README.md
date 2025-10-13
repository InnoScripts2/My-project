# Communication Services — Логика интеграции

## Назначение

Оркестрация отправки сообщений через email и SMS провайдеры. Управляет логикой доставки отчётов, уведомлений и подтверждений клиентам.

## Цель

Обеспечить надёжную доставку отчётов и уведомлений клиентам с поддержкой:
- Повторных попыток (retry) при сбоях
- Fallback между провайдерами
- Шаблонизации сообщений
- Логирования доставки

## Входы

- **Email сообщение:**
  - `to: string` — email получателя
  - `subject: string` — тема письма
  - `body: string` — HTML тело письма
  - `attachments?: Array<{ filename: string; path: string }>` — вложения (PDF отчёты)
  - `metadata?: Record<string, any>` — метаданные (sessionId, reportId и т. д.)

- **SMS сообщение:**
  - `to: string` — номер телефона получателя (формат E.164)
  - `text: string` — текст сообщения (до 160 символов)
  - `metadata?: Record<string, any>` — метаданные

- **Отчёт для отправки:**
  - `reportId: string` — ID сгенерированного отчёта
  - `reportPath: string` — путь к файлу отчёта (HTML/PDF)
  - `recipient: { email?: string; phone?: string }` — контакты получателя
  - `serviceType: 'thickness' | 'diagnostics'` — тип услуги

## Выходы

- **DeliveryResult:**
  - `success: boolean` — успешность доставки
  - `messageId?: string` — ID сообщения от провайдера
  - `provider: string` — использованный провайдер (smtp, twilio и т. д.)
  - `deliveredAt?: Date` — время доставки
  - `error?: string` — описание ошибки при неудаче
  - `retryCount?: number` — количество попыток

- **DeliveryStatus:**
  - `status: 'queued' | 'sent' | 'delivered' | 'failed'`
  - `attempts: number` — количество попыток
  - `lastAttemptAt?: Date` — время последней попытки

## Принципы

- **Устойчивость:** Автоматические повторы при временных сбоях
- **Fallback:** Переключение на альтернативный провайдер при недоступности основного
- **Наблюдаемость:** Подробное логирование всех попыток доставки
- **Dev-режим:** Симуляция отправки в DEV без реальных провайдеров

## Интеграция

Использует:
- `01-interfaces/` — контракты email/SMS провайдеров
- `04-infrastructure/` — конкретные реализации (SMTP, Twilio, SendGrid и т. д.)
- `03-apps/kiosk-agent/src/reports/` — генерация отчётов для отправки
