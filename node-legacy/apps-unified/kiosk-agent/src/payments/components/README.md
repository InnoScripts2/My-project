# Payments Components

Модуль платежей для киоск-агента: провайдеры PSP, обработчики вебхуков, retry-стратегии, метрики Prometheus.

## Компоненты

### provider-factory.ts

Фабрика провайдеров платежей с поддержкой разных окружений.

**Интерфейс PaymentProvider:**

- `createPaymentIntent(amount, currency, meta): Promise<PaymentIntent>` - Создать платёжное намерение
- `getStatus(intentId): Promise<PaymentStatus>` - Получить статус платежа
- `getIntent(intentId): Promise<PaymentIntent>` - Получить полную информацию о платеже
- `confirmDevOnly(intentId): Promise<PaymentIntent>` - DEV-подтверждение
- `markManualConfirmation(intentId, payload): Promise<PaymentIntent>` - Ручное подтверждение

**Провайдеры:**

- `DevPaymentProvider` - Эмулятор для DEV/QA окружений
- PROD - NotImplemented (до интеграции с реальным PSP)

**Функции:**

- `createPaymentProvider(environment)` - Создать провайдер по окружению
- `getEnvironmentFromEnv()` - Получить окружение из `process.env.AGENT_ENV`
- `createPaymentProviderFromEnv()` - Создать провайдер из переменных среды

**Переменные окружения:**

- `AGENT_ENV` - Окружение (DEV/QA/PROD)

**Пример:**

```typescript
import { createPaymentProviderFromEnv } from './components/provider-factory.js'

const provider = createPaymentProviderFromEnv()
const intent = await provider.createPaymentIntent(350, 'RUB', { serviceType: 'thickness' })
console.log('Intent ID:', intent.id)
console.log('QR URL:', intent.qrUrl)

// Позже проверяем статус
const status = await provider.getStatus(intent.id)
console.log('Status:', status)
```

### webhook-validator.ts

Валидация подписей вебхуков от платёжных систем.

**Класс WebhookValidator:**

- `validate(payload, signature): WebhookValidationResult` - Валидировать подпись

**Вспомогательные функции:**

- `createWebhookValidator()` - Создать валидатор
- `WebhookValidator.createDevSignature(payload, secret)` - Создать DEV подпись для тестов

**Переменные окружения:**

- `WEBHOOK_SECRET` - Секрет для валидации (DEV: 'dev-secret')
- `AGENT_ENV` - Окружение

**Реализация:**

- DEV: HMAC-SHA256 валидация
- PROD: NotImplemented (до интеграции с конкретным PSP)

**Пример:**

```typescript
import { createWebhookValidator, WebhookValidator } from './components/webhook-validator.js'

const validator = createWebhookValidator()
const payload = JSON.stringify({ intentId: 'dev_123', status: 'succeeded' })
const signature = WebhookValidator.createDevSignature(payload)

const result = validator.validate(payload, signature)
if (result.valid) {
  console.log('Webhook validated successfully')
} else {
  console.error('Invalid webhook:', result.error)
}
```

### retry.ts

Экспоненциальный бэкофф для опроса статуса платежа.

**Класс PaymentStatusPoller:**

- `pollStatus(provider, intentId): Promise<RetryResult<PaymentStatus>>` - Опросить статус с retry

**Конфигурация RetryConfig:**

- `maxAttempts` - Максимальное количество попыток (по умолчанию 20)
- `initialDelayMs` - Начальная задержка (по умолчанию 1000)
- `maxDelayMs` - Максимальная задержка (по умолчанию 10000)
- `timeoutMs` - Общий таймаут (по умолчанию 300000 = 5 минут)

**Функции:**

- `createPaymentStatusPoller(config?)` - Создать поллер

**Пример:**

```typescript
import { createPaymentStatusPoller } from './components/retry.js'
import { createPaymentProviderFromEnv } from './components/provider-factory.js'

const provider = createPaymentProviderFromEnv()
const intent = await provider.createPaymentIntent(480, 'RUB')

const poller = createPaymentStatusPoller({
  maxAttempts: 30,
  timeoutMs: 600000 // 10 минут
})

const result = await poller.pollStatus(provider, intent.id)
if (result.success) {
  console.log('Final status:', result.value)
  console.log('Attempts:', result.attempts)
} else {
  console.error('Polling failed:', result.error)
}
```

### metrics.ts

Prometheus метрики для платежей.

**Класс PaymentsMetricsCollector:**

Метрики:
- `payments_component_intent_created_total{provider}` - Созданные интенты
- `payments_component_intent_succeeded_total{provider}` - Успешные платежи
- `payments_component_intent_failed_total{provider}` - Неудачные платежи
- `payments_component_status_checked_total{provider,status}` - Проверки статуса
- `payments_component_operation_duration_seconds{operation,provider}` - Длительность операций

**Методы:**

- `recordIntentCreated(provider)` - Записать создание интента
- `recordIntentSucceeded(provider)` - Записать успешный платёж
- `recordIntentFailed(provider)` - Записать ошибку платежа
- `recordStatusChecked(provider, status)` - Записать проверку статуса
- `startTimer(operation, provider)` - Начать измерение времени

**Функции:**

- `getPaymentsMetrics(registry?)` - Получить singleton метрик
- `createPaymentsMetrics(registry?)` - Создать новый экземпляр (для тестов)

**Пример:**

```typescript
import { getPaymentsMetrics } from './components/metrics.js'

const metrics = getPaymentsMetrics()

// Записываем создание интента
metrics.recordIntentCreated('dev-emulator')

// Измеряем время операции
const timer = metrics.startTimer('createIntent', 'dev-emulator')
await provider.createPaymentIntent(350, 'RUB')
timer()

// Записываем успешный платёж
metrics.recordIntentSucceeded('dev-emulator')
```

## Общий пример использования

```typescript
import { createPaymentProviderFromEnv } from './components/provider-factory.js'
import { createPaymentStatusPoller } from './components/retry.js'
import { getPaymentsMetrics } from './components/metrics.js'
import { createWebhookValidator } from './components/webhook-validator.js'

async function processPayment(amount: number, currency: string) {
  const provider = createPaymentProviderFromEnv()
  const metrics = getPaymentsMetrics()
  
  // Создаём интент
  metrics.recordIntentCreated('dev-emulator')
  const timer = metrics.startTimer('createIntent', 'dev-emulator')
  const intent = await provider.createPaymentIntent(amount, currency)
  timer()
  
  console.log('Покажите клиенту QR:', intent.qrUrl)
  
  // Опрашиваем статус
  const poller = createPaymentStatusPoller()
  const result = await poller.pollStatus(provider, intent.id)
  
  if (result.success && result.value === 'succeeded') {
    metrics.recordIntentSucceeded('dev-emulator')
    console.log('Платёж успешен!')
  } else {
    metrics.recordIntentFailed('dev-emulator')
    console.error('Платёж не прошёл')
  }
}

// Обработка вебхука
function handleWebhook(req: Request) {
  const validator = createWebhookValidator()
  const payload = req.body
  const signature = req.headers['x-webhook-signature']
  
  const result = validator.validate(payload, signature)
  if (!result.valid) {
    throw new Error(`Invalid webhook: ${result.error}`)
  }
  
  // Обрабатываем вебхук...
}
```

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `AGENT_ENV` | Окружение (DEV/QA/PROD) | DEV |
| `WEBHOOK_SECRET` | Секрет для валидации вебхуков | dev-secret |

## Интеграция с реальными PSP

Для PROD окружения требуется:

1. Выбрать PSP (Stripe, YooKassa, Tinkoff)
2. Реализовать провайдер в `provider-factory.ts`
3. Реализовать валидацию подписи в `webhook-validator.ts`
4. Настроить переменные окружения PSP
5. Протестировать в QA режиме

Пример структуры для YooKassa:

```typescript
class YooKassaPaymentProvider implements PaymentProvider {
  constructor(shopId: string, secretKey: string) {
    // Инициализация YooKassa SDK
  }
  
  async createPaymentIntent(amount: number, currency: string) {
    // Создание платежа через YooKassa API
  }
  
  // Реализация остальных методов...
}
```

