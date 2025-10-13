# Указатель пакета `packages/payments`

| Компонент | Назначение |
| --- | --- |
| `src/types.ts` | Контракты: статусы, интерфейсы провайдера, метрики. Расширен полями `qrUrl` и `qrText` в `PaymentIntent`. |
| `src/payment-service.ts` | Оркестратор платежей, проверки окружения, метрики, доступ к статусам/intent. |
| `src/providers/in-memory-provider.ts` | DEV/тестовый провайдер с поддержкой ручного подтверждения и dev-confirm. |
| `src/providers/yookassa-provider.ts` | **Производственный провайдер ЮKassa**: создание платежей с QR, проверка статусов, обработка вебхуков. |
| `src/prometheus/collector.ts` | Prometheus metrics collector для платежных событий. |
| `src/webhook/utils.ts` | Утилиты для вебхуков: валидация HMAC подписей, rate limiting, deduplication. |
| `src/dev/DevPaymentProvider.ts` | DEV-only провайдер для разработки (не используется в продакшне). |
| `src/index.ts` | Главная точка экспорта (реэкспорт контрактов и сервисов). |
| `yookassa.d.ts` | TypeScript type definitions для yookassa SDK. |

## Интеграции

- Использовать в `apps/kiosk-agent`: сервис создаётся с передачей реального провайдера.
- **Поддержка YooKassa:** В PROD режиме автоматически используется `YooKassaPaymentProvider` при наличии переменных окружения `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`.
- **QR коды:** `PaymentIntent` теперь содержит поля `qrUrl` и `qrText` для отображения QR-кодов клиенту.
- **Webhook обработка:** Endpoint `/webhooks/payments` в kiosk-agent принимает уведомления от ЮKassa с валидацией HMAC подписи.
- Поддерживает статусы `manual_confirmed`, возврат полного `PaymentIntent`, метод `getIntent`.
- **Метрики Prometheus:** интегрированы через `PaymentsPrometheusCollector`, экспортируются в общий `/metrics`.
- Агент выставляет HTTP-эндпоинты: `POST /payments/intent(s)`, `POST /payments/confirm-dev`, `POST /payments/manual-confirm` (и `/admin/payments/manual-confirm`), `GET /payments/:id`, `GET /payments/:id/status`, `GET /payments/metrics`, `POST /webhooks/payments`.

## TODO

- ✅ Реализовать фактический провайдер для интеграции с PSP (YooKassa).
- ✅ Добавить юнит-тесты на PaymentService и in-memory провайдер.
- ✅ Добавить webhook utilities с тестами.
- ✅ Добавить Prometheus metrics collector.
- ⏳ Согласовать схему хранения истории статусов с отчётами и журналами.
- ⏳ Добавить интеграционные тесты для YooKassa provider (требуется test shop).
