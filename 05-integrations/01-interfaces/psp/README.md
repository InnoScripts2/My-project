# PSP (Payment Service Provider) — Интерфейсы

## Назначение

Контракты и интерфейсы для интеграции с платёжными провайдерами (PSP). Определяет единый API для работы с различными PSP (ЮKassa, Сбербанк, Tinkoff и др.).

## Цель

Обеспечить единообразный интерфейс для создания платёжных намерений (payment intent), получения статусов, обработки вебхуков и генерации QR-кодов независимо от конкретного провайдера.

## Входы

- **Параметры платежа:**
  - `amount: number` — сумма в рублях
  - `currency: string` — валюта (по умолчанию RUB)
  - `description: string` — описание платежа
  - `metadata?: Record<string, any>` — дополнительные данные (sessionId, serviceType и т. д.)
  - `returnUrl?: string` — URL для возврата после оплаты

- **Идентификаторы:**
  - `paymentId: string` — уникальный идентификатор платежа

- **Webhook данные:**
  - `payload: any` — тело запроса от провайдера
  - `signature: string` — HMAC подпись для валидации

## Выходы

- **PaymentIntent:**
  - `id: string` — уникальный ID платежа
  - `status: 'pending' | 'succeeded' | 'canceled'` — статус платежа
  - `amount: number` — сумма
  - `qrCodeUrl?: string` — URL QR-кода для оплаты (СБП)
  - `confirmation?: { type: string; confirmationUrl: string }` — данные для подтверждения
  - `metadata?: Record<string, any>` — переданные метаданные

- **PaymentStatus:**
  - `status: 'pending' | 'succeeded' | 'canceled'`
  - `updatedAt: Date` — время последнего обновления

- **WebhookValidation:**
  - `isValid: boolean` — результат проверки подписи
  - `paymentId?: string` — ID платежа из webhook
  - `newStatus?: string` — новый статус платежа

## Принципы

- Абстракция от конкретного PSP
- Единый контракт для всех провайдеров
- Безопасная валидация вебхуков (HMAC)
- Поддержка различных типов подтверждения (QR, redirect)

## Интеграция

Интерфейсы из этого модуля будут реализованы в:
- `04-infrastructure/` — конкретные адаптеры (YooKassaProvider, SberbankProvider и т. д.)
- `02-application/` — оркестрация платёжных потоков
