# Prometheus Metrics Catalog (Cycle-2)

Каталог метрик Prometheus для мониторинга финального коннектора цикла-2.

## Платёжные метрики

### payments_intent_created_total

**Type:** Counter  
**Description:** Общее количество созданных платежных intent  
**Labels:**
- `provider` - провайдер платежей (yookassa, sbp, inmemory)
- `service` - тип услуги (thickness, obd_deposit)

**Example:**
```
payments_intent_created_total{provider="yookassa",service="thickness"} 142
payments_intent_created_total{provider="yookassa",service="obd_deposit"} 23
```

**Use cases:**
- Мониторинг общего количества платёжных запросов
- Сравнение популярности услуг
- Выявление аномалий в создании интентов

### payments_status_transitions_total

**Type:** Counter  
**Description:** Общее количество переходов между статусами платежей  
**Labels:**
- `provider` - провайдер платежей
- `from` - исходный статус (pending, succeeded, etc.)
- `to` - новый статус

**Example:**
```
payments_status_transitions_total{provider="yookassa",from="pending",to="succeeded"} 118
payments_status_transitions_total{provider="yookassa",from="pending",to="expired"} 12
payments_status_transitions_total{provider="yookassa",from="pending",to="canceled"} 8
```

**Use cases:**
- Отслеживание успешности платежей (pending → succeeded)
- Мониторинг истечения платежей (pending → expired)
- Выявление частых отмен

### payments_webhook_verified_total

**Type:** Counter  
**Description:** Общее количество проверок подписи вебхуков  
**Labels:**
- `provider` - провайдер платежей
- `ok` - результат проверки (true, false)

**Example:**
```
payments_webhook_verified_total{provider="yookassa",ok="true"} 132
payments_webhook_verified_total{provider="yookassa",ok="false"} 2
```

**Use cases:**
- Мониторинг безопасности (валидность подписей)
- Выявление попыток подделки вебхуков
- Алерты при росте невалидных подписей

**Alert example:**
```yaml
- alert: WebhookSignatureFailures
  expr: rate(payments_webhook_verified_total{ok="false"}[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: High rate of webhook signature failures
```

### payments_errors_total

**Type:** Counter  
**Description:** Общее количество ошибок платёжных операций  
**Labels:**
- `provider` - провайдер платежей
- `stage` - стадия ошибки (create_intent, get_status, webhook_processing)

**Example:**
```
payments_errors_total{provider="yookassa",stage="create_intent"} 5
payments_errors_total{provider="yookassa",stage="webhook_processing"} 2
```

**Use cases:**
- Мониторинг надёжности платёжного провайдера
- Выявление проблем на определённых стадиях
- SLA мониторинг

**Alert example:**
```yaml
- alert: PaymentErrorsHigh
  expr: rate(payments_errors_total[5m]) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: High rate of payment errors
```

## Метрики замков

### lock_open_attempts_total

**Type:** Counter  
**Description:** Общее количество попыток открытия замков  
**Labels:**
- `deviceType` - тип устройства (thickness, obd)
- `result` - результат попытки (success, policy_blocked, failed, already_opened)

**Example:**
```
lock_open_attempts_total{deviceType="thickness",result="success"} 95
lock_open_attempts_total{deviceType="thickness",result="policy_blocked"} 12
lock_open_attempts_total{deviceType="thickness",result="already_opened"} 8
lock_open_attempts_total{deviceType="thickness",result="failed"} 2
```

**Use cases:**
- Мониторинг успешности выдачи устройств
- Отслеживание блокировок политикой (непрошедшие оплаты)
- Выявление проблем с замками (failed)
- Мониторинг идемпотентности (already_opened)

**Alert example:**
```yaml
- alert: LockFailureRate
  expr: rate(lock_open_attempts_total{result="failed"}[10m]) > 0.02
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: High lock failure rate for {{ $labels.deviceType }}
```

### lock_state

**Type:** Gauge  
**Description:** Текущее состояние замка (0=closed, 1=opened, 2=fault)  
**Labels:**
- `deviceType` - тип устройства (thickness, obd)

**Example:**
```
lock_state{deviceType="thickness"} 0
lock_state{deviceType="obd"} 1
```

**Use cases:**
- Мониторинг текущего состояния замков в реальном времени
- Выявление застрявших замков (opened слишком долго)
- Алерты при неисправностях (state=2)

**Alert example:**
```yaml
- alert: LockStuckOpen
  expr: lock_state{deviceType="thickness"} == 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: Lock {{ $labels.deviceType }} stuck open for 5 minutes

- alert: LockFault
  expr: lock_state == 2
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: Lock {{ $labels.deviceType }} in fault state
```

## Watchdog метрики

### watchdog_restarts_total

**Type:** Counter  
**Description:** Общее количество перезапусков watchdog  
**Labels:**
- `reason` - причина перезапуска (heartbeat_timeout, process_crash, manual)

**Example:**
```
watchdog_restarts_total{reason="heartbeat_timeout"} 2
watchdog_restarts_total{reason="process_crash"} 1
```

**Use cases:**
- Мониторинг стабильности агента
- Выявление частых перезапусков
- Алерты при критичных проблемах

**Alert example:**
```yaml
- alert: FrequentRestarts
  expr: rate(watchdog_restarts_total[1h]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: Agent experiencing frequent restarts
```

## Build метрики

### app_build_info

**Type:** Gauge (always 1)  
**Description:** Информация о сборке приложения  
**Labels:**
- `version` - версия приложения (из APP_VERSION или "0.1.0")
- `channel` - канал релиза (DEV, QA, PROD)

**Example:**
```
app_build_info{version="0.1.0",channel="PROD"} 1
app_build_info{version="0.2.0-beta",channel="QA"} 1
```

**Use cases:**
- Отслеживание текущих версий в разных окружениях
- Проверка успешности деплоя
- Мониторинг версионирования

## Стандартные метрики Node.js

Агент также экспортирует стандартные метрики Node.js через `prom-client`:

- `process_cpu_user_seconds_total` - CPU time в user mode
- `process_cpu_system_seconds_total` - CPU time в system mode
- `process_heap_bytes` - размер heap памяти
- `process_resident_memory_bytes` - RSS память
- `nodejs_eventloop_lag_seconds` - задержка event loop
- `nodejs_gc_duration_seconds` - продолжительность GC

## Дашборды Grafana

### Основной дашборд киоска

**Панели:**
1. Payment Success Rate
   ```promql
   rate(payments_status_transitions_total{to="succeeded"}[5m])
   / rate(payments_intent_created_total[5m])
   ```

2. Lock Open Success Rate
   ```promql
   rate(lock_open_attempts_total{result="success"}[5m])
   / rate(lock_open_attempts_total[5m])
   ```

3. Active Locks (currently opened)
   ```promql
   sum(lock_state == 1)
   ```

4. Webhook Processing Latency (требует timing метрики)
   ```promql
   histogram_quantile(0.95, rate(webhook_processing_duration_seconds_bucket[5m]))
   ```

5. Agent Restarts
   ```promql
   increase(watchdog_restarts_total[1h])
   ```

### Операционный дашборд

**Панели:**
1. Payment Errors by Stage
   ```promql
   sum by (stage) (rate(payments_errors_total[5m]))
   ```

2. Lock Failures by Device
   ```promql
   sum by (deviceType) (rate(lock_open_attempts_total{result="failed"}[5m]))
   ```

3. Webhook Signature Failures
   ```promql
   rate(payments_webhook_verified_total{ok="false"}[5m])
   ```

4. Memory Usage
   ```promql
   process_resident_memory_bytes / 1024 / 1024
   ```

## Интеграция с Alertmanager

**Рекомендуемые правила:**

```yaml
groups:
  - name: kiosk_agent_critical
    interval: 1m
    rules:
      - alert: PaymentSystemDown
        expr: rate(payments_errors_total[5m]) > 0.5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: Payment system experiencing high error rate
          
      - alert: LockMechanicalFailure
        expr: lock_state == 2
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: Lock {{ $labels.deviceType }} has mechanical failure
          
      - alert: AgentUnresponsive
        expr: up{job="kiosk-agent"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Kiosk agent is down

  - name: kiosk_agent_warning
    interval: 5m
    rules:
      - alert: HighPaymentExpirationRate
        expr: rate(payments_status_transitions_total{to="expired"}[10m]) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High rate of payment expirations
          
      - alert: PolicyBlocksIncreasing
        expr: rate(lock_open_attempts_total{result="policy_blocked"}[10m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Increasing number of policy blocks
```

## Экспорт метрик

**Endpoint:** `GET /metrics`  
**Format:** Prometheus text format  
**Security:** Только для внутренних запросов (localhost или VPN)

**Scrape configuration:**
```yaml
scrape_configs:
  - job_name: 'kiosk-agent'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

## Ретеншн и хранение

**Рекомендации:**
- Short-term (Prometheus): 15 дней
- Long-term (VictoriaMetrics/Thanos): 6 месяцев
- Aggregated (downsampling): 2 года

**Retention rules:**
```yaml
retention:
  raw: 15d
  aggregated_5m: 180d
  aggregated_1h: 730d
```
