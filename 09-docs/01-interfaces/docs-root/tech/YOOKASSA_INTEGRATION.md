# YooKassa Payment Integration Guide

## Обзор

Интеграция с платежным провайдером ЮKassa для приёма платежей через QR-коды. Поддерживает генерацию QR для оплаты, обработку вебхуков и автоматическое обновление статусов платежей.

## Архитектура

```
┌──────────────┐         ┌────────────────┐         ┌──────────────┐
│   Frontend   │────────▶│  Kiosk Agent   │────────▶│   YooKassa   │
│   (UI/QR)    │         │  (Backend)     │         │     API      │
└──────────────┘         └────────────────┘         └──────────────┘
                                 │                           │
                                 │                           │
                                 ▼                           │
                         ┌────────────────┐                 │
                         │  Supabase DB   │                 │
                         │  (Optional)    │                 │
                         └────────────────┘                 │
                                 ▲                           │
                                 │                           │
                         ┌────────────────┐                 │
                         │ Edge Function  │◀────────────────┘
                         │   (Webhook)    │
                         └────────────────┘
```

## Компоненты

### 1. YooKassaPaymentProvider

**Расположение:** `packages/payments/src/providers/yookassa-provider.ts`

**Функциональность:**
- Создание платежа с генерацией QR-кода
- Проверка статуса платежа
- Обновление статуса из вебхука
- Маппинг статусов ЮKassa в внутренние статусы

**Методы:**
```typescript
// Создание платежа
await provider.createPaymentIntent(amount, currency, meta)

// Получение статуса
await provider.getStatus(intentId)

// Получение полного intent
await provider.getIntent(intentId)

// Обновление из вебхука (internal)
provider.updateFromWebhook(yookassaId, status, meta)
```

### 2. Webhook Handler

**Расположение:** `apps/kiosk-agent/src/index.ts` (эндпоинт `/webhooks/payments`)

**Функциональность:**
- Проверка HMAC подписи
- Парсинг payload
- Обновление статуса платежа
- Логирование событий

**Безопасность:**
- HMAC SHA-256 signature validation
- Rate limiting (встроен в webhook utilities)
- Deduplication защита от повторной обработки

### 3. Prometheus Metrics

**Расположение:** `packages/payments/src/prometheus/collector.ts`

**Метрики:**
- `payments_intent_created_total` — количество созданных платежей
- `payments_status_checked_total` — количество проверок статуса
- `payments_dev_confirmed_total` — DEV подтверждения
- `payments_manual_confirmed_total` — ручные подтверждения
- `payments_status_count` — текущее количество платежей по статусам

## Настройка

### Шаг 1: Регистрация в ЮKassa

1. Зарегистрируйтесь на [yookassa.ru](https://yookassa.ru/)
2. Получите Shop ID и Secret Key в [личном кабинете](https://yookassa.ru/my)
3. Настройте webhook URL в разделе "Уведомления"

### Шаг 2: Конфигурация Environment Variables

Добавьте в `.env`:

```bash
# YooKassa Configuration
YOOKASSA_SHOP_ID=your-shop-id-here
YOOKASSA_SECRET_KEY=your-secret-key-here
YOOKASSA_RETURN_URL=http://localhost:8080/payment-complete

# Webhook Secret (генерируется автоматически или задается вручную)
PROVIDER_WEBHOOK_SECRET=your-webhook-secret-here

# Environment (PROD для включения YooKassa)
AGENT_ENV=PROD
```

### Шаг 3: Настройка Webhook в ЮKassa

**URL вебхука:**
```
https://your-project.supabase.co/functions/v1/payments-webhook
```

**HTTP метод:** POST

**Заголовок подписи:**
```
x-provider-signature: <hmac-sha256-hex>
```

**Формат тела (JSON):**
```json
{
  "event_type": "payment.succeeded",
  "payment_id": "2d76c123-abcd-5000-a000-1e1234567890",
  "status": "succeeded",
  "amount": 350,
  "currency": "RUB",
  "metadata": {
    "session_id": "sess_abc123",
    "service": "thickness"
  }
}
```

### Шаг 4: Развертывание Edge Function

**Файл:** `supabase/functions/payments-webhook/index.ts` (уже существует)

**Переменные окружения в Supabase:**
```bash
supabase secrets set PROVIDER_WEBHOOK_SECRET=your-webhook-secret
```

**Развертывание:**
```bash
supabase functions deploy payments-webhook
```

## Использование

### Frontend: Создание платежа

```javascript
const response = await fetch('http://localhost:7070/payments/intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 35000, // 350 рублей в копейках
    currency: 'RUB',
    meta: {
      service: 'thickness',
      sessionId: 'sess_123'
    }
  })
})

const { intent } = await response.json()
console.log('QR URL:', intent.qrUrl)
console.log('QR Text:', intent.qrText)
```

### Frontend: Отображение QR

```html
<div id="qr-container">
  <p>Отсканируйте QR-код для оплаты:</p>
  <div id="qr-code"></div>
  <p id="qr-fallback"></p>
</div>

<script>
// Используйте библиотеку qrcode.js или аналогичную
const QRCode = window.QRCode;
const qr = new QRCode(document.getElementById('qr-code'), {
  text: intent.qrUrl,
  width: 256,
  height: 256
});

// Или текстовая ссылка
document.getElementById('qr-fallback').textContent = intent.qrText;
</script>
```

### Frontend: Polling статуса

```javascript
function pollPaymentStatus(intentId, onUpdate, intervalMs = 2000) {
  const interval = setInterval(async () => {
    const response = await fetch(
      `http://localhost:7070/payments/${intentId}/status`
    )
    const { status } = await response.json()
    
    onUpdate(status)
    
    if (status === 'succeeded' || status === 'failed') {
      clearInterval(interval)
    }
  }, intervalMs)
  
  return () => clearInterval(interval)
}

// Использование
const stopPolling = pollPaymentStatus(intent.id, (status) => {
  console.log('Payment status:', status)
  
  if (status === 'succeeded') {
    alert('Оплата успешна!')
    // Переход к следующему экрану
  }
})
```

## Безопасность

### HMAC Signature Validation

**Генерация подписи (ЮKassa):**
```
HMAC-SHA256(raw_body, PROVIDER_WEBHOOK_SECRET) → hex string
```

**Проверка подписи (наш код):**
```typescript
import { verifyWebhookSignature } from '@selfservice/payments'

const isValid = verifyWebhookSignature(rawBody, signature, secret)
if (!isValid) {
  return res.status(401).json({ error: 'invalid_signature' })
}
```

### Rate Limiting

```typescript
import { WebhookRateLimiter } from '@selfservice/payments'

const limiter = new WebhookRateLimiter({
  maxRequests: 100,
  windowMs: 60000 // 1 минута
})

if (!limiter.isAllowed(paymentId)) {
  return res.status(429).json({ error: 'too_many_requests' })
}
```

### Deduplication

```typescript
import { WebhookDeduplicator } from '@selfservice/payments'

const dedup = new WebhookDeduplicator({ ttlMs: 3600000 }) // 1 час

if (!dedup.isNew(eventId)) {
  return res.status(200).json({ message: 'Already processed' })
}
```

## Мониторинг

### Prometheus Metrics

**Эндпоинт:** `GET http://localhost:7070/metrics`

**Пример метрик:**
```
# HELP payments_intent_created_total Total number of payment intents created
# TYPE payments_intent_created_total counter
payments_intent_created_total{currency="RUB",status="pending"} 42

# HELP payments_status_checked_total Total number of payment status checks
# TYPE payments_status_checked_total counter
payments_status_checked_total{status="pending"} 156
payments_status_checked_total{status="succeeded"} 38

# HELP payments_status_count Current count of payments by status
# TYPE payments_status_count gauge
payments_status_count{status="pending"} 4
payments_status_count{status="succeeded"} 38
```

### Логирование

**Ключевые события:**
- `[payments] Using YooKassa provider` — провайдер активирован
- `[webhook] Received: event_type=...` — получен вебхук
- `[webhook] Invalid signature` — ошибка валидации подписи

## Тестирование

### Unit Tests

```bash
cd packages/payments
npm test
```

**Тесты:**
- ✅ Webhook signature validation
- ✅ Rate limiter behavior
- ✅ Deduplication logic
- ✅ Payment service integration

### Integration Testing (Manual)

#### 1. Тест создания платежа

```bash
curl -X POST http://localhost:7070/payments/intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 35000,
    "currency": "RUB",
    "meta": {
      "service": "thickness"
    }
  }'
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "intent": {
    "id": "pi_abc123",
    "amount": 35000,
    "currency": "RUB",
    "status": "pending",
    "qrUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=...",
    "qrText": "..."
  },
  "breakdown": {
    "gross": 35000,
    "net": 33600,
    "partner": {
      "name": "rDevice",
      "sharePercent": 0.04,
      "shareAmount": 1400
    }
  }
}
```

#### 2. Тест webhook

```bash
# Генерация подписи
echo -n '{"event_type":"payment.succeeded","payment_id":"test-123","status":"succeeded"}' | \
  openssl dgst -sha256 -hmac "your-webhook-secret" -hex

# Отправка webhook
curl -X POST http://localhost:7070/webhooks/payments \
  -H "Content-Type: application/json" \
  -H "x-provider-signature: <generated-signature>" \
  -d '{
    "event_type": "payment.succeeded",
    "payment_id": "test-123",
    "status": "succeeded"
  }'
```

## Troubleshooting

### Проблема: QR не генерируется

**Причина:** YooKassa не настроен или провайдер не выбран

**Решение:**
1. Проверьте `AGENT_ENV=PROD`
2. Проверьте наличие `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`
3. Проверьте логи: `[payments] Using YooKassa provider`

### Проблема: Webhook не обрабатывается

**Причина:** Неверная подпись или отсутствует secret

**Решение:**
1. Проверьте `PROVIDER_WEBHOOK_SECRET` в `.env`
2. Проверьте формат подписи (должен быть hex SHA-256)
3. Проверьте логи: `[webhook] Invalid signature`

### Проблема: Статус не обновляется

**Причина:** Webhook не достигает kiosk-agent

**Решение:**
1. Используйте Supabase Edge Function как relay
2. Проверьте URL webhook в настройках ЮKassa
3. Убедитесь, что Edge Function развернута

## Производственное развертывание

### Чек-лист

- [ ] Получены production credentials от ЮKassa
- [ ] Настроены переменные окружения (`YOOKASSA_*`)
- [ ] Развернута Edge Function с правильным секретом
- [ ] Настроен webhook URL в личном кабинете ЮKassa
- [ ] Протестирован полный flow с реальным платежом (небольшой суммой)
- [ ] Настроен мониторинг (Prometheus + Grafana)
- [ ] Настроены алерты на критические ошибки

### Рекомендации

1. **Используйте HTTPS** для всех эндпоинтов
2. **Логируйте все платежи** в базу данных или файлы
3. **Настройте retry logic** для вебхуков (может потеряться)
4. **Мониторьте rate limits** ЮKassa API
5. **Храните секреты безопасно** (не коммитьте в Git)

## Дополнительные ресурсы

- [ЮKassa API Docs](https://yookassa.ru/developers/api)
- [Webhook Security Best Practices](https://yookassa.ru/developers/using-api/webhooks)
- [QR Code Generation](https://github.com/soldair/node-qrcode)

## Поддержка

При возникновении проблем:
1. Проверьте логи kiosk-agent
2. Проверьте логи Supabase Edge Function
3. Проверьте статус в личном кабинете ЮKassa
4. Обратитесь к документации ЮKassa
