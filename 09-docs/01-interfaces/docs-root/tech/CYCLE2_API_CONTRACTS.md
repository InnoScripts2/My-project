# API Контракты Финального Коннектора (Цикл-2)

Документация внешних API роутов агента киоска для интеграции платежей, замков и мониторинга.

## Общие принципы

- Все эндпойнты используют JSON для запросов и ответов
- Rate limiting: 5 req/10s per IP, 10 req/10s per session
- Health эндпойнты (`/healthz`, `/readyz`, `/livez`, `/metrics`) исключены из rate limiting
- Идемпотентность обеспечивается через `operationKey` или `sessionId:deviceType:paymentIntentId`

## Платёжные операции

### POST /api/payments/intents

Создание платежного intent для оплаты услуги.

**Request Body:**
```json
{
  "amount": 350,
  "currency": "RUB",
  "service": "thickness",
  "sessionId": "kiosk-session-123",
  "meta": {
    "vehicleType": "sedan"
  }
}
```

**Response (200 OK):**
```json
{
  "id": "intent_abc123",
  "provider": "yookassa",
  "qr_url": "https://yookassa.ru/...",
  "qr_svg": "data:image/svg+xml;base64,...",
  "expires_at": "2025-01-07T10:30:00Z"
}
```

**Error Responses:**
- `400` - Validation failed (неверный формат данных)
- `502` - Provider error (ошибка платёжного провайдера)
- `429` - Rate limit exceeded
- `500` - Internal error

**Поддерживаемые сервисы:**
- `thickness` - Толщинометрия (350₽ sedan/hatchback, 400₽ minivan)
- `obd_deposit` - Залог для OBD адаптера (политика зависит от `LOCK_POLICY_OBD`)

### GET /api/payments/intents/:id

Получение текущего статуса платежного intent.

**Response (200 OK):**
```json
{
  "id": "intent_abc123",
  "status": "succeeded",
  "updated_at": "2025-01-07T10:25:30Z"
}
```

**Возможные статусы:**
- `pending` - Ожидает оплаты
- `succeeded` - Оплата подтверждена
- `canceled` - Отменена
- `expired` - Истекла (не оплачена в течение 15 минут)
- `failed` - Ошибка оплаты

**Error Responses:**
- `400` - Intent ID required
- `404` - Intent not found
- `500` - Internal error

## Операции с замками

### POST /api/locks/open

Открытие замка для выдачи устройства с проверкой политики выдачи.

**Request Body:**
```json
{
  "deviceType": "thickness",
  "sessionId": "kiosk-session-123",
  "paymentIntentId": "intent_abc123"
}
```

**Response (200 OK):**
```json
{
  "actionId": "thickness-1759556328-abc123",
  "result": "opened"
}
```

**Значения `result`:**
- `opened` - Замок успешно открыт
- `already_opened` - Замок уже был открыт с этим operationKey (идемпотентность)

**Error Responses:**
- `400` - Validation failed
- `409` - Precondition failed (не выполнены условия для выдачи):
  - Для `thickness`: требуется `paymentIntentId` со статусом `succeeded`
  - Для `obd`: требуется `vehicleSelected` или депозит (зависит от `LOCK_POLICY_OBD`)
- `423` - Device locked (замок занят или неисправен)
- `429` - Rate limit exceeded
- `500` - Lock operation failed

**Политики выдачи:**

**Толщиномер (`thickness`):**
- Требует подтверждённую оплату (`paymentStatus=succeeded`)
- Не выдаётся без оплаты в PROD-режиме

**OBD адаптер (`obd`):**
- По умолчанию: выдаётся сразу после выбора авто (`vehicleSelected=true`)
- С депозитом (`LOCK_POLICY_OBD=deposit_required`): требуется оплата депозита

**Идемпотентность:**
- Ключ формируется как `sessionId:deviceType:paymentIntentId`
- Повторные запросы с тем же ключом возвращают тот же `actionId`
- Замок открывается только один раз

### GET /api/locks/status

Получение текущего статуса всех замков.

**Response (200 OK):**
```json
{
  "devices": [
    {
      "deviceType": "thickness",
      "state": "closed",
      "lastActionId": "thickness-1759556328-abc123",
      "updated_at": "2025-01-07T10:26:00Z"
    },
    {
      "deviceType": "obd",
      "state": "opened",
      "lastActionId": "obd-1759556330-def456",
      "updated_at": "2025-01-07T10:26:05Z"
    }
  ]
}
```

**Возможные состояния:**
- `closed` - Замок закрыт
- `opened` - Замок открыт (устройство выдано)
- `fault` - Неисправность замка

## Health и мониторинг

### GET /healthz

Liveness probe - проверка работоспособности процесса.

**Response (200 OK):**
```json
{
  "status": "pass",
  "version": "0.1.0",
  "releaseId": "b590378",
  "serviceId": "kiosk-agent"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "fail",
  "details": "Process unhealthy"
}
```

### GET /readyz

Readiness probe - проверка готовности к обработке запросов.

**Response (200 OK):**
```json
{
  "status": "pass",
  "checks": {
    "persistence": {
      "status": "ok",
      "latency": 15
    }
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "fail",
  "checks": {
    "persistence": {
      "status": "error",
      "error": "Connection failed"
    }
  }
}
```

### GET /livez

Always returns 200 OK if process is alive.

### GET /metrics

Prometheus metrics endpoint (внутренний, не публиковать наружу).

**Response (200 OK):**
```
# HELP payments_intent_created_total Total number of payment intents created
# TYPE payments_intent_created_total counter
payments_intent_created_total{provider="yookassa",service="thickness"} 42

# HELP lock_open_attempts_total Total number of lock open attempts
# TYPE lock_open_attempts_total counter
lock_open_attempts_total{deviceType="thickness",result="success"} 38
lock_open_attempts_total{deviceType="thickness",result="failed"} 4

# HELP lock_state Current lock state
# TYPE lock_state gauge
lock_state{deviceType="thickness"} 0
lock_state{deviceType="obd"} 1

# HELP app_build_info Build information
# TYPE app_build_info gauge
app_build_info{version="0.1.0",channel="PROD"} 1
```

## Вебхуки

### POST /webhooks/payments

Endpoint для приёма вебхуков от платёжного провайдера (обрабатывается через Supabase Edge Function).

**Headers:**
- `x-provider-signature` - HMAC SHA-256 подпись payload

**Webhook Flow:**
1. Провайдер отправляет вебхук в Edge Function
2. Edge Function проверяет HMAC подпись
3. Проверяется дедупликация по `provider_event_id`
4. Событие сохраняется в `webhook_events` с флагом `signature_verified`
5. Вызывается RPC `rpc_update_payment_status` для обновления статуса
6. Возвращается 200 OK

**Дедупликация:**
- По `provider_event_id` - уникальный ID события от провайдера
- Повторные события игнорируются и возвращают 200 OK с `dedup: true`

## Rate Limiting

**Лимиты:**
- Global: 5 requests / 10 seconds per IP
- Session: 10 requests / 10 seconds per sessionId
- Исключения: `/healthz`, `/readyz`, `/livez`, `/metrics`

**Response (429 Too Many Requests):**
```json
{
  "ok": false,
  "error": "rate_limit_exceeded",
  "message": "Too many requests, please try again later",
  "retryAfter": 8
}
```

**Headers:**
- `Retry-After` - количество секунд до следующей попытки

## Безопасность

**Переменные окружения:**
- `PROVIDER_WEBHOOK_SECRET` - секрет для проверки HMAC подписи вебхуков
- `YOOKASSA_SHOP_ID` - ID магазина в ЮKassa
- `YOOKASSA_SECRET_KEY` - секретный ключ ЮKassa
- `LOCK_POLICY_OBD` - политика выдачи OBD (`immediate` или `deposit_required`)
- `AGENT_ENV` - окружение (`DEV`, `QA`, `PROD`)

**PROD инварианты:**
- Никаких моков устройств
- Никаких dev-флагов (кнопка "Пропустить" недоступна)
- Обязательная валидация HMAC для вебхуков
- Rate limiting активен

## Логирование и аудит

**Корреляция:**
Каждая операция логируется с контекстом:
- `sessionId` - ID сессии клиента
- `intentId` - ID платёжного intent
- `actionId` - ID операции с замком
- `deviceType` - тип устройства
- `provider_event_id` - ID события от провайдера

**Уровни логов:**
- `info` - успешные операции
- `warn` - ретраи, таймауты, блокировки политикой
- `error` - ошибки провайдера, замков, внутренние ошибки

**Аудит:**
- `webhook_events` - все вебхуки с проверкой подписи и дедупликацией
- `payments` - история изменений статусов через metadata
- Логи контроллера замков с actionId и operationKey
