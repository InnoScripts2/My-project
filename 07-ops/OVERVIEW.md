# Observability Infrastructure — Overview

## Созданные компоненты

### 1. Prometheus Configuration (`01-interfaces/prometheus/`)

**Файл:** `prometheus.yml`

Базовая конфигурация Prometheus для сбора метрик с kiosk-agent:
- Scrape interval: 15 секунд
- Target: `localhost:7070/metrics`
- Загрузка правил алертов из `02-application/alerts/`
- Опциональный node_exporter для системных метрик

**Использование:**
```bash
prometheus --config.file=07-ops/01-interfaces/prometheus/prometheus.yml
```

### 2. Alert Rules (`02-application/alerts/`)

#### `payments.rules.yml`
Правила алертов для платёжной системы:

**Critical alerts:**
- `PaymentSystemDown` — высокая частота ошибок платежей (>50%)
- `PaymentIntentsStalled` — платежи зависли более чем на 90 секунд
- `WebhookSignatureFailures` — высокая частота неудачной верификации подписей

**Warning alerts:**
- `HighPaymentExpirationRate` — высокая частота истечения платежей
- `UnusualPaymentVolume` — аномальный объём платежей (отклонение >50% от вчерашнего)
- `ManualConfirmationsIncreasing` — рост количества ручных подтверждений

#### `locks.rules.yml`
Правила алертов для системы замков:

**Critical alerts:**
- `LockMechanicalFailure` — механическая неисправность замка (state=2)
- `LockOpenFailureRate` — высокая частота неудачных открытий (>30%)
- `AllLocksStuck` — все замки застряли

**Warning alerts:**
- `PolicyBlocksIncreasing` — рост блокировок по политикам
- `LockStuckOpen` — замок открыт более 30 минут
- `UnusualLockActivity` — аномальная активность замков

### 3. Grafana Dashboards (`04-infrastructure/grafana/`)

#### `kiosk-overview.json`
Основной дашборд для мониторинга здоровья киоска:

**Панели:**
1. Payment Success Rate (stat) — процент успешных платежей
2. Lock Open Success Rate (stat) — процент успешных открытий замков
3. Active Locks (gauge) — количество открытых замков
4. Agent Restarts (stat) — перезапуски за час
5. Payment Intents Over Time (graph) — динамика создания/завершения платежей
6. Lock Operations by Device Type (graph) — операции с замками по типам устройств
7. Memory Usage (graph) — использование памяти
8. Build Info (table) — информация о версии и канале

#### `operations.json`
Детальный операционный дашборд для troubleshooting:

**Панели:**
1. Payment Errors by Stage (graph) — ошибки по стадиям платежей
2. Lock Failures by Device Type (graph) — неудачи замков по типам
3. Webhook Signature Failures (stat) — неудачная верификация вебхуков
4. Pending Over 90s (stat) — зависшие платежи
5. Manual Confirmations (graph) — ручные и dev подтверждения
6. Lock State by Device (graph) — состояние замков
7. Payment Status Transitions (graph) — переходы между статусами платежей
8. Watchdog Restarts by Reason (graph) — перезапуски по причинам
9. Event Loop Lag (graph) — задержка event loop
10. GC Duration (graph) — длительность сборки мусора
11. Last Payment Event (stat) — время с последнего события

### 4. Logging Format (`03-domain/logging/`)

#### `format.md`
Описание формата структурированных логов:

**Формат:** JSON Lines (JSONL)

**Обязательные поля:**
- `timestamp` (ISO 8601)
- `level` (debug/info/warn/error/fatal)
- `message`
- `service` (kiosk-agent/cloud-api/frontend)
- `environment` (DEV/QA/PROD)

**Опциональные поля:**
- `requestId`, `sessionId`, `component`, `userId`
- `data` (структурированные данные)
- `error` (stack trace, code)
- `duration` (в миллисекундах)

**Уровни:** debug → info → warn → error → fatal

**Приватность:** не логировать персональные данные, платёжные реквизиты, пароли

#### `parsers-examples.md`
Примеры парсеров логов:

**Инструменты:**
- jq (командная строка)
- Logstash
- Vector
- Grep
- Python
- Grafana Loki (LogQL)
- Splunk

**Примеры запросов:**
- Фильтрация по уровню, компоненту, sessionId
- Извлечение полей
- Топ ошибок
- Экспорт в CSV

### 5. Test Data (`05-tests/`)

#### `README.md`
Описание тестовых данных и их назначения.

#### `sample-metrics.txt`
Примеры метрик в формате Prometheus text:
- Платёжные метрики (intent_created, status_transitions, errors)
- Метрики замков (open_attempts, state)
- Watchdog метрики (restarts)
- Build info
- Node.js метрики (memory, CPU, GC, event loop)

**Количество:** 20+ уникальных метрик с различными labels

#### `sample-logs.jsonl`
Примеры логов в формате JSON Lines:
- Нормальные сценарии (запуск агента, создание сессии, оплата, измерения)
- Предупреждения (зависшие платежи, высокая память)
- Ошибки (неудачи замков, проблемы с подписью, потеря соединения)

**Количество:** 20 событий, покрывающих основные сценарии

#### `test-scenarios.md`
Инструкции для ручной проверки:

**Сценарии:**
1. Проверка метрик платежей
2. Проверка метрик замков
3. Проверка алертов (симуляция условий срабатывания)
4. Проверка парсинга логов
5. Проверка Node.js метрик
6. Проверка Build Info

**Чек-лист:** 8 пунктов для валидации работоспособности панелей

## Структура директорий

```
07-ops/
├── 01-interfaces/
│   └── prometheus/
│       └── prometheus.yml              # Конфигурация сбора метрик
├── 02-application/
│   └── alerts/
│       ├── payments.rules.yml          # Алерты платежей
│       └── locks.rules.yml             # Алерты замков
├── 03-domain/
│   └── logging/
│       ├── format.md                   # Описание формата логов
│       └── parsers-examples.md         # Примеры парсеров
├── 04-infrastructure/
│   └── grafana/
│       ├── kiosk-overview.json         # Основной дашборд
│       └── operations.json             # Операционный дашборд
└── 05-tests/
    ├── README.md                       # Описание тестовых данных
    ├── sample-metrics.txt              # Примеры метрик
    ├── sample-logs.jsonl               # Примеры логов
    └── test-scenarios.md               # Тестовые сценарии
```

## Валидация

Все конфигурации проверены:
- ✅ YAML синтаксис (yamllint)
- ✅ JSON синтаксис (json.tool)
- ✅ JSONL формат (построчный парсинг)
- ✅ Только изменения в 07-ops/

## Следующие шаги

1. **Интеграция с реальным kiosk-agent:**
   - Убедиться, что метрики экспортируются на порт 7070
   - Проверить совместимость форматов

2. **Запуск Prometheus:**
   ```bash
   prometheus --config.file=07-ops/01-interfaces/prometheus/prometheus.yml
   ```

3. **Импорт дашбордов в Grafana:**
   - Использовать файлы из 04-infrastructure/grafana/
   - Настроить источник данных (Prometheus)

4. **Настройка Alertmanager:**
   - Добавить receivers (email, Slack, PagerDuty)
   - Настроить routing и группировку

5. **Централизованное логирование:**
   - Развернуть Grafana Loki или ELK stack
   - Настроить агенты для отправки логов

6. **Long-term хранение:**
   - Настроить VictoriaMetrics или Thanos
   - Настроить downsampling и retention

## Связь с существующим кодом

Эта observability инфраструктура интегрируется с:

**Metrics:**
- `03-apps/02-application/kiosk-agent/src/payments/prometheus.ts`
- `03-apps/02-application/kiosk-agent/src/metrics/cycle2.ts`
- `03-apps/02-application/cloud-api/src/index.ts` (endpoint /metrics)

**Alerts:**
- `03-apps/02-application/kiosk-agent/src/monitoring/alerts.ts`
- `03-apps/02-application/kiosk-agent/src/monitoring/__tests__/alerts.test.ts`

**Documentation:**
- `09-docs/01-interfaces/docs-root/tech/CYCLE2_METRICS_CATALOG.md`
- `09-docs/01-interfaces/docs-root/tech/MONITORING_OBSERVABILITY_STRATEGY.md`

## Примечания

- Все файлы созданы в соответствии с requirements из problem_statement
- Никаких изменений не внесено за пределы 07-ops/
- Конфигурации готовы к использованию в production с минимальными доработками
- Тестовые данные помечены как "только для DEV/QA"
