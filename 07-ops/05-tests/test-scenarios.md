# Тестовые сценарии для проверки панелей мониторинга

## Назначение

Инструкции для ручной проверки работоспособности дашбордов Grafana и алертов Prometheus.

## Предварительные требования

1. Запущенный Prometheus с конфигурацией из `01-interfaces/prometheus/prometheus.yml`
2. Загруженные алерты из `02-application/alerts/`
3. Импортированные дашборды из `04-infrastructure/grafana/`
4. (Опционально) Запущенный kiosk-agent с метриками на localhost:7070

## Сценарий 1: Проверка метрик платежей

### Подготовка
```bash
# Использовать sample-metrics.txt для симуляции метрик
# В продакшене эти метрики будут приходить с реального агента
```

### Проверки в дашборде "Kiosk Health Overview"

1. **Payment Success Rate (панель #1)**
   - Ожидаемое значение: ~80-90%
   - Формула: `succeeded / created * 100`
   - Цвет: зелёный при >95%, жёлтый при >80%, красный при <80%

2. **Payment Intents Over Time (панель #5)**
   - График должен показывать 3 линии: Created, Succeeded, Expired
   - Created >= Succeeded + Expired

### Проверки в дашборде "Operations"

1. **Payment Errors by Stage (панель #1)**
   - Должны быть видны ошибки по стадиям: create_intent, get_status, webhook_processing
   - Высота столбцов пропорциональна количеству ошибок

2. **Webhook Signature Failures (панель #3)**
   - Ожидаемое значение: близко к 0
   - Цвет: зелёный при 0, жёлтый при >0.01, красный при >0.1

## Сценарий 2: Проверка метрик замков

### Проверки в дашборде "Kiosk Health Overview"

1. **Lock Open Success Rate (панель #2)**
   - Ожидаемое значение: >98%
   - Формула: `success / total * 100`

2. **Active Locks (панель #3)**
   - Gauge от 0 до 2
   - Зелёный: 0 (все закрыты)
   - Жёлтый: 1 (один открыт)
   - Красный: 2 (оба открыты или застряли)

### Проверки в дашборде "Operations"

1. **Lock Failures by Device Type (панель #2)**
   - Группировка по deviceType: thickness, obd
   - График частоты неудачных попыток открытия

2. **Lock State by Device (панель #6)**
   - Значения: 0 (closed), 1 (opened), 2 (fault)
   - Должны быть две линии: thickness и obd

## Сценарий 3: Проверка алертов

### Alert: PaymentSystemDown
```promql
rate(payments_errors_total[5m]) > 0.5
```
**Симуляция:**
- Создать >50% ошибок в payments_errors_total за 5 минут
- Алерт должен сработать через 2 минуты

**Ожидаемый результат:**
- Severity: critical
- Annotation: "Payment system experiencing high error rate"

### Alert: LockMechanicalFailure
```promql
lock_state == 2
```
**Симуляция:**
- Установить lock_state в значение 2 (fault) для любого deviceType
- Алерт должен сработать через 30 секунд

**Ожидаемый результат:**
- Severity: critical
- Annotation содержит deviceType

### Alert: PaymentIntentsStalled
```promql
payments_pending_over_90_seconds > 0
```
**Симуляция:**
- Установить payments_pending_over_90_seconds > 0
- Алерт должен сработать через 5 минут

**Ожидаемый результат:**
- Severity: critical
- Annotation показывает количество застрявших платежей

## Сценарий 4: Проверка парсинга логов

### Подготовка
```bash
# Использовать sample-logs.jsonl
cp 07-ops/05-tests/sample-logs.jsonl /tmp/test-logs.jsonl
```

### jq фильтры

1. **Найти все ошибки:**
```bash
cat /tmp/test-logs.jsonl | jq -c 'select(.level == "error")'
```
Ожидаемый результат: 4 записи

2. **События конкретной сессии:**
```bash
cat /tmp/test-logs.jsonl | jq -c 'select(.sessionId == "T-20250115-001")'
```
Ожидаемый результат: 9 записей (от старта до завершения)

3. **Только платёжные события:**
```bash
cat /tmp/test-logs.jsonl | jq -c 'select(.component == "payments")'
```
Ожидаемый результат: 6 записей

### Grafana Loki (если настроен)

```logql
# Все логи
{service="kiosk-agent"}

# Только ошибки
{service="kiosk-agent"} | json | level="error"

# Частота ошибок
rate({service="kiosk-agent"} | json | level="error" [1m])
```

## Сценарий 5: Проверка Node.js метрик

### Проверки в дашборде "Operations"

1. **Memory Usage (панель в Overview #7)**
   - Ожидаемое значение: 50-150 MB (из sample-metrics: ~50MB)
   - Алерт если >1024 MB

2. **Event Loop Lag (панель #9)**
   - Ожидаемое значение: <0.01s в норме
   - Проблемы если >0.1s

3. **GC Duration (панель #10)**
   - Показывает время, затраченное на сборку мусора
   - Spike может указывать на проблемы с памятью

## Сценарий 6: Проверка Build Info

### Проверка в дашборде "Kiosk Health Overview"

1. **Build Info (панель #8)**
   - Таблица с version и channel
   - Из sample-metrics: version="0.1.0", channel="PROD"
   - Полезно для отслеживания версий в разных терминалах

## Чек-лист проверки

- [ ] Все панели в "Kiosk Health Overview" отображаются корректно
- [ ] Все панели в "Operations" отображаются корректно
- [ ] PromQL запросы выполняются без ошибок
- [ ] Алерты загружены в Prometheus
- [ ] jq парсеры работают с sample-logs.jsonl
- [ ] Цветовые пороги (thresholds) настроены правильно
- [ ] Легенды на графиках читаемы
- [ ] Единицы измерения (units) корректны

## Известные ограничения

1. Sample данные статичны — в реальности метрики изменяются со временем
2. Нет метрик для HTTP endpoints (они в cloud-api, не в agent)
3. Некоторые алерты требуют rate() — нужно время для накопления данных
4. Для полноценной проверки нужен реальный kiosk-agent

## Следующие шаги

После успешной проверки:
1. Интегрировать с реальным kiosk-agent
2. Настроить Alertmanager для отправки уведомлений
3. Добавить long-term хранилище (VictoriaMetrics/Thanos)
4. Настроить централизованное логирование (Loki/ELK)
