# Промпт 5 Paywall и платежи

ЦЕЛЬ
Реализовать платёжную систему с разделением DEV/PROD режимов, интерфейс PaymentService, эмулятор для разработки, интеграцию с реальным PSP для продакшна, webhook обработку, retry логику, безопасность, метрики, тесты. Фронтенд paywall интеграция через QR и polling статусов. Без симуляций реальных транзакций в PROD.

КОНТЕКСТ
Проект: автосервис самообслуживания с двумя услугами (толщиномер 350-400₽, диагностика 480₽). Оплата: толщиномер до выдачи устройства, диагностика после формирования результатов (paywall). Вход: часть анализа 5, интеграция с фронтендом из промпта 4, агентом из промптов 1-2.

ГРАНИЦЫ
Платёжный модуль не знает о драйверах устройств, отчётах, UI деталях. Он предоставляет интерфейс PaymentService для создания платёжных намерений, проверки статусов, подтверждения. Верхний слой Application использует PaymentService для валидации оплаты перед выдачей устройства или разблокировкой результатов. Не хранит номера карт и чувствительные данные платёжных систем.

АРХИТЕКТУРА

МОДУЛЬ apps/kiosk-agent/src/payments/PaymentService.ts
Интерфейс PaymentService: createIntent(amount: number, currency: string, metadata: object) Promise PaymentIntent, getStatus(intentId: string) Promise PaymentStatus, confirm(intentId: string) Promise boolean (DEV only), cancel(intentId: string) Promise boolean. PaymentIntent: intentId string UUID, amount number, currency string, status enum, qrCodeUrl string optional, qrCodeData string optional, createdAt timestamp, expiresAt timestamp. PaymentStatus enum: pending, confirmed, failed, expired. Методы возвращают Promise.

РЕАЛИЗАЦИИ apps/kiosk-agent/src/payments/providers/
DevPaymentProvider.ts: эмулятор для DEV режима, автоподтверждение через N секунд (default 2), ручное подтверждение через confirm, генерация mock QR data:image/png;base64 или текстовая строка.
ProdPaymentProvider.ts: интеграция с реальным PSP (например, ЮKassa, CloudPayments, Stripe). Адаптер PaymentGateway интерфейс с методами createPayment, checkStatus, processWebhook. Конкретные реализации: YooKassaAdapter, CloudPaymentsAdapter. Выбор через конфиг или ENV.

СТАТУСЫ И ПЕРЕХОДЫ
Граф состояний: pending (начальное) → confirmed (успех), pending → failed (ошибка отклонения/сети), pending → expired (таймаут 10 минут), confirmed и failed финальные, expired финальный. Retry: при failed причина может быть temporary (сетевая ошибка) → разрешён retry создания нового интента, permanent (отклонено банком) → retry не имеет смысла, клиент должен выбрать другой метод или отменить. Polling: клиент (фронтенд) опрашивает getStatus каждые 2 секунды до финального статуса или 10 минут (300 запросов макс).

DEV РЕЖИМ apps/kiosk-agent/src/payments/providers/DevPaymentProvider.ts
Конструктор принимает config: autoConfirmDelay number default 2000ms, manualMode boolean default false. createIntent: генерация intentId UUID, amount, currency, status pending, qrCodeData mock строка "DEV_QR_${intentId}", createdAt Date.now(), expiresAt +10min. Если autoConfirmDelay и не manualMode: setTimeout autoConfirmDelay → статус confirmed. getStatus: возврат текущего статуса из in-memory Map. confirm: ручной переход pending → confirmed, валидация статуса перед переходом. cancel: переход в expired. Логирование всех операций debug level. Не генерирует реальные QR коды провайдеров. Mock QR: либо base64 заглушка, либо текст для отображения в UI.

PROD PSP ИНТЕГРАЦИЯ apps/kiosk-agent/src/payments/providers/YooKassaAdapter.ts
Зависимости: npm yookassa или axios для REST API. Конфигурация: shopId, secretKey из ENV. createIntent: вызов YooKassa API POST /v3/payments, body amount value currency, confirmation type redirect return_url (или qr), metadata sessionId serviceType. Ответ: payment id, status pending, confirmation confirmation_url или qr data. Маппинг на PaymentIntent. getStatus: GET /v3/payments/:id, маппинг status pending/succeeded/canceled на PaymentStatus. Webhook: endpoint /api/payments/webhook, валидация подписи через secretKey, парсинг notification, обновление статуса в локальном хранилище, emit event payment-confirmed или payment-failed. Идемпотентность: проверка intentId уже обработан, повторный webhook игнорируется. Retry политика: при сетевых ошибках (timeout, 5xx) retry 3 попытки exponential backoff 1s → 2s → 4s. При 4xx (клиентская ошибка) не retry, логирование и возврат failed.

WEBHOOK ЭНДПОЙНТ apps/kiosk-agent/src/routes/payments.ts
POST /api/payments/webhook: чтение body raw (для валидации подписи), парсинг JSON, извлечение intentId и статус. Вызов adapter.processWebhook(body, headers). Обновление локального состояния платежа. Emit событие payment-status-changed. Возврат 200 OK PSP (обязательно для подтверждения получения). Логирование с correlation ID. Rate limiting: ограничение на количество webhook запросов от одного IP (защита от флуда). Signature validation: проверка HMAC или другого метода подписи PSP, если подпись невалидна → возврат 403 Forbidden и алерт.

ЛОКАЛЬНОЕ ХРАНИЛИЩЕ apps/kiosk-agent/src/payments/PaymentStore.ts
In-memory Map intentId → PaymentRecord. PaymentRecord: intentId, amount, currency, status, qrCodeUrl, qrCodeData, metadata, createdAt, updatedAt, expiresAt. TTL: 1 час, после чего удаление. Persist опционально в SQLite для истории транзакций (без чувствительных данных карт). Методы: save, get, update, delete, cleanup. Cleanup запускается по cron каждые 10 минут.

БЕЗОПАСНОСТЬ
Секреты PSP: shopId, secretKey, apiKey в .env файле, не в коде. Доступ через process.env. HTTPS: обязательно для PROD, webhook только по HTTPS. Логи: никаких номеров карт, CVV, полных данных держателя. Маскирование PII: если metadata содержит email/phone, маскировать при логировании (e***@***.ru, +7***1234). Audit trail: все операции createIntent, confirm, cancel, webhook логируются с timestamp, intentId, amount, status, result. Хранение audit логов 90 дней. Валидация входов: amount положительный, currency ISO код (RUB, USD), metadata не превышает 1KB. Rate limiting: макс 10 createIntent за минуту от одного IP/сессии (защита от abuse).

МЕТРИКИ PROMETHEUS apps/kiosk-agent/src/payments/metrics.ts
prom-client регистрация: payments_intents_total counter labels status (pending, confirmed, failed, expired), env (DEV, PROD). payments_confirmed_total counter labels env. payments_failed_total counter labels reason (network, rejected, timeout), env. payments_duration_seconds histogram labels status, env. payments_webhook_received_total counter labels status. Экспорт через /metrics эндпойнт агента. Алерты Prometheus: payment_failure_rate = rate(payments_failed_total) / rate(payments_intents_total) > 0.1 в течение 10 минут → нотификация операторам.

ФРОНТЕНД ИНТЕГРАЦИЯ apps/kiosk-frontend/src/core/payment-client.js
Методы: createIntent(amount, currency, service) POST /api/payments/intent, getStatus(intentId) GET /api/payments/status/:intentId, cancelIntent(intentId) POST /api/payments/cancel/:intentId. Использование в экране paywall (из промпта 4): вызов createIntent, получение intentId и qrCodeUrl/qrCodeData, отображение QR, запуск polling getStatus каждые 2s, при confirmed → unblur результаты и переход на results, при failed/expired → модальное окно с сообщением и опциями повтора или отмены.

REST API apps/kiosk-agent/src/routes/payments.ts
POST /api/payments/intent: body amount, currency, metadata (sessionId, service). Вызов paymentService.createIntent. Возврат 201 Created PaymentIntent или 400/500. GET /api/payments/status/:intentId: вызов paymentService.getStatus. Возврат 200 PaymentStatus или 404. POST /api/payments/cancel/:intentId: вызов paymentService.cancel. Возврат 200 success или 404/500. POST /api/payments/confirm/:intentId (DEV only): вызов paymentService.confirm. Возврат 200 success или 403 Forbidden в PROD. Middleware: auth опционально (если требуется защита API), request logger, error handler.

КОНФИГУРАЦИЯ apps/kiosk-agent/config/payments.json
DEV: provider DevPaymentProvider, autoConfirmDelay 2000, manualMode false. PROD: provider YooKassaAdapter, shopId ENV, secretKey ENV, webhookUrl https domain /api/payments/webhook, retryAttempts 3, retryDelay 1000. Чтение конфига при старте агента. Валидация: обязательные поля проверяются, отсутствие секретов в PROD вызывает ошибку запуска.

ТЕСТЫ

ЮНИТ apps/kiosk-agent/src/payments/tests/PaymentService.test.ts
Mock provider. Тест createIntent: проверка возврата PaymentIntent с intentId, amount, currency, status pending. Тест getStatus: pending → confirmed через autoConfirm, проверка статуса. Тест confirm (DEV): ручное подтверждение pending → confirmed. Тест cancel: переход в expired. Тест статусы transitions: валидация недопустимых переходов (confirmed → pending запрещён). Тест TTL: создание интента, wait 1 час + 1s, проверка удаления из store.

ЮНИТ apps/kiosk-agent/src/payments/providers/tests/YooKassaAdapter.test.ts
Mock axios. Тест createIntent: mock POST /v3/payments → 200 payment response, маппинг на PaymentIntent. Тест getStatus: mock GET /v3/payments/:id → succeeded, маппинг на confirmed. Тест webhook: mock processWebhook, валидация подписи success, обновление статуса. Тест signature validation: invalid signature → reject. Тест retry: mock network error 500 → retry 3 раза, затем failed.

ИНТЕГРАЦИЯ apps/kiosk-agent/src/payments/tests/integration-api.test.ts
Поднятие агента на тестовом порту, DEV provider. HTTP клиент supertest. Последовательность: POST /api/payments/intent amount 480 → 201 intentId qrCodeData, GET /api/payments/status/:intentId → 200 pending, wait 2s (autoConfirm), GET status → 200 confirmed, POST /api/payments/cancel/:intentId → 200. Проверка всех статусов и данных.

ИНТЕГРАЦИЯ WEBHOOK apps/kiosk-agent/src/payments/tests/integration-webhook.test.ts
Mock PSP webhook: POST /api/payments/webhook с payload intentId status succeeded, signature valid. Проверка обновления статуса в store, emit события payment-status-changed. Mock invalid signature: проверка 403 Forbidden.

E2E apps/kiosk-agent/src/payments/tests/e2e-paywall.test.ts
Полный поток с фронтендом (Playwright или cypress). Сценарий: клиент завершает сканирование OBD → paywall экран → createIntent → отображение QR → polling статуса → autoConfirm (DEV) → unblur результаты. Проверка UI, API вызовов, метрик.

ДОКУМЕНТАЦИЯ apps/kiosk-agent/src/payments/README.md
Описание архитектуры платежей, интерфейс PaymentService, провайдеры DEV/PROD, статусы и transitions, webhook обработка, безопасность, конфигурация, тестирование, примеры интеграции PSP (YooKassa, CloudPayments), troubleshooting. Диаграмма последовательности: фронтенд → API createIntent → PSP → webhook → фронтенд getStatus → confirmed → unblur.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

Пример 1: создание платёжного намерения
import { PaymentService } from './payments/PaymentService.js';
const paymentService = new PaymentService(config);
const intent = await paymentService.createIntent(480, 'RUB', { sessionId: 'abc123', service: 'diagnostics' });
console.log('Intent ID:', intent.intentId, 'QR:', intent.qrCodeData);

Пример 2: polling статуса
async function waitForConfirmation(intentId) {
  const maxAttempts = 150; // 150 * 2s = 5 минут
  for (let i = 0; i < maxAttempts; i++) {
    const status = await paymentService.getStatus(intentId);
    if (status === PaymentStatus.CONFIRMED) return true;
    if (status === PaymentStatus.FAILED || status === PaymentStatus.EXPIRED) return false;
    await sleep(2000);
  }
  return false; // timeout
}

Пример 3: обработка webhook (Express route)
router.post('/api/payments/webhook', async (req, res) => {
  try {
    await yooKassaAdapter.processWebhook(req.body, req.headers);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook error', error);
    res.status(400).send('Invalid webhook');
  }
});

Пример 4: фронтенд paywall (из промпта 4 детализация)
async function showPaywall(amount) {
  const intent = await paymentClient.createIntent(amount, 'RUB', 'diagnostics');
  displayQR(intent.qrCodeData);
  const confirmed = await pollStatus(intent.intentId);
  if (confirmed) {
    unblurResults();
    showScreen('diagnostics-results');
  } else {
    showError('Платёж не прошёл. Повторить?');
  }
}

ИНТЕГРАЦИЯ С APPLICATION LAYER
Application слой (например, DiagnosticsOrchestrator) слушает событие scan-complete. Перед отображением результатов проверяет: const paymentStatus = await paymentService.getStatus(sessionPaymentIntentId). Если confirmed: разрешить доступ к результатам. Если pending/failed/expired: редирект на paywall. Аналогично для толщиномера: перед выдачей устройства проверка оплаты.

ОШИБКИ
Кастомные классы: PaymentError, PaymentTimeoutError, PaymentDeclinedError. Все extends Error. Поля: message, code, intentId, details, timestamp. Коды ошибок: PAYMENT_TIMEOUT, PAYMENT_DECLINED, PAYMENT_NETWORK_ERROR, PAYMENT_INVALID_SIGNATURE. Возврат клиенту: status error, code, message понятное для пользователя ("Платёж отклонён. Проверьте данные карты.").

РИСКИ И МИТИГАЦИЯ
Риск: webhook потерян (PSP отправил, но агент не получил). Митигация: fallback polling на стороне фронтенда, периодическая синхронизация статусов с PSP. Риск: таймауты PSP API. Митигация: retry с backoff, алерты на высокий процент failed. Риск: несогласованность статусов UI/backend. Митигация: контрактные тесты, polling как единственный источник истины. Риск: PII утечка в логах. Митигация: маскирование, валидация логов, audit. Риск: abuse (множественные создания интентов). Митигация: rate limiting, мониторинг аномалий. Риск: неверная подпись webhook (атака). Митигация: валидация HMAC, отклонение невалидных, алерты.

ROADMAP РАСШИРЕНИЯ
Фаза 1: DEV эмулятор, базовый REST API, фронтенд paywall. Фаза 2: YooKassa интеграция, webhook обработка, retry логика. Фаза 3: CloudPayments как альтернатива, выбор провайдера через конфиг. Фаза 4: рассрочка, промокоды, скидки (если требуется бизнесом).

КРИТЕРИИ ACCEPTANCE
Интерфейс PaymentService реализован. Провайдеры DEV и PROD (YooKassa минимум) работают. Статусы transitions корректны. Webhook эндпойнт обрабатывает и валидирует. Retry логика настроена. Безопасность: секреты в ENV, HTTPS, маскирование PII, audit trail. Локальное хранилище с TTL. Метрики Prometheus и алерты. Тесты юнит/интеграция/E2E проходят. Документация и примеры созданы. Фронтенд paywall интегрирован (из промпта 4). Без симуляций реальных транзакций в PROD (только структуры данных в DEV mock). Код на TypeScript ESM strict. Линтеры проходят. Commit message: feat(payments): add PaymentService with DEV emulator and YooKassa integration, webhook handling, retry logic, security.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций проекта. Никаких эмодзи. Code review: explicit errors, async/await, no console.log в PROD, валидация входов, security best practices. Pre-commit: lint + test.

ИТОГ
По завершении полностью функциональная платёжная система с разделением DEV/PROD, интерфейсом PaymentService, эмулятором для разработки, интеграцией YooKassa для продакшна, webhook обработкой, retry логикой, безопасностью, метриками, тестами, документацией, примерами. Фронтенд paywall ready из промпта 4. Интеграция с Application layer для валидации оплаты перед выдачей устройства или разблокировкой результатов. Готовность к реальным транзакциям в PROD. Код соответствует инструкциям проекта.
