# Анализ часть 5 платежи и paywall

КОНТЕКСТ
Цель: уточнить контракты платежей DEV/PROD, статусы и повторные попытки. Вход: apps/kiosk-agent/src/payments/*, docs/tech.

ИНТЕРФЕЙС PAYMENTSERVICE
createIntent(amount, currency, metadata): создать намерение оплаты, вернуть intentId и QR. getStatus(intentId): получить статус pending/confirmed/failed/expired. confirm(intentId): ручное подтверждение в DEV. cancel(intentId): отмена платежа.

СТАТУСЫ И ПЕРЕХОДЫ
pending → confirmed (успех), pending → failed (ошибка сети/отказ), pending → expired (таймаут), confirmed финальный, failed финальный. Retry на failed если причина temporary. Polling статуса каждые 2 сек до финала или 10 минут.

DEV РЕЖИМ
Эмулятор: автоподтверждение через 2 сек после createIntent. Кнопка confirm в UI для ручного управления. Флаг AGENT_ENV=DEV. Логирование всех операций. PROD: только реальный PSP, без эмуляторов.

PROD PSP ИНТЕГРАЦИЯ
Адаптер PSP: интерфейс PaymentGateway с методами создать/статус/webhook. Webhook endpoint /api/payments/webhook для коллбеков PSP. Валидация подписи webhook. Идемпотентность операций по intentId. Retry политика при сетевых сбоях: 3 попытки с экспоненциальным backoff.

БЕЗОПАСНОСТЬ
Секреты PSP в ENV, не в коде. HTTPS обязателен. Логи без номеров карт и чувствительных данных. Маскирование PII. Audit trail всех платежных операций.

PAYWALL ФРОНТЕНД
Блюрит контейнер результатов. Модальное окно с QR и таймером. Polling статуса через API. После confirmed: разблюр, скрытие модалки, переход к результатам. После failed/expired: сообщение и опции повтора или отмены.

МЕТРИКИ
payments_intents_total{status, env}, payments_confirmed_total{env}, payments_failed_total{reason, env}, payments_duration_seconds. Алерты на высокий процент failed.

ТЕСТЫ
Юнит: переходы статусов, retry логика, валидация webhook. Интеграция: mock PSP, сценарии success/fail/timeout. E2E: фронтенд → API → эмулятор → callback.

РИСКИ
Несогласованность UI/backend: контрактные тесты. Webhook потеряны: fallback polling. Таймауты PSP: retry и алерты. PII утечка: валидация логов.

КРИТЕРИИ ГОТОВНОСТИ
Интерфейс PaymentService утверждён, диаграмма статусов зафиксирована, адаптер PSP описан, безопасность проверена, тесты определены, метрики добавлены.
