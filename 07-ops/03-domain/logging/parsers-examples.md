# Примеры парсеров логов

## Инструменты для работы с JSON Lines логами

## jq (командная строка)

### Фильтрация по уровню

```bash
# Показать только ошибки
cat kiosk-agent.log | jq -c 'select(.level == "error")'

# Показать предупреждения и ошибки
cat kiosk-agent.log | jq -c 'select(.level == "warn" or .level == "error")'
```

### Фильтрация по компоненту

```bash
# Только события платежей
cat kiosk-agent.log | jq -c 'select(.component == "payments")'

# События замков за последние 100 строк
tail -100 kiosk-agent.log | jq -c 'select(.component == "locks")'
```

### Фильтрация по sessionId

```bash
# Все события конкретной сессии
cat kiosk-agent.log | jq -c 'select(.sessionId == "T-20250115-001")'
```

### Извлечение полей

```bash
# Только timestamp и message
cat kiosk-agent.log | jq -r '"\(.timestamp) \(.message)"'

# Список всех ошибок с кодами
cat kiosk-agent.log | jq -c 'select(.level == "error") | {timestamp, message, code: .error.code}'
```

## Logstash

### Конфигурация input

```ruby
input {
  file {
    path => "/var/log/kiosk/kiosk-agent.log"
    codec => json_lines
    type => "kiosk-agent"
  }
  
  file {
    path => "/var/log/kiosk/cloud-api.log"
    codec => json_lines
    type => "cloud-api"
  }
}
```

### Фильтры

```ruby
filter {
  # Добавить hostname
  mutate {
    add_field => { "hostname" => "%{HOSTNAME}" }
  }
  
  # Парсить дату
  date {
    match => [ "timestamp", "ISO8601" ]
    target => "@timestamp"
  }
  
  # Пометить критичные события
  if [level] == "error" or [level] == "fatal" {
    mutate {
      add_tag => [ "critical" ]
    }
  }
  
  # Обогащение данных платежей
  if [component] == "payments" and [data][intentId] {
    mutate {
      add_field => { "intent_id" => "%{[data][intentId]}" }
    }
  }
}
```

### Output в Elasticsearch

```ruby
output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "kiosk-logs-%{+YYYY.MM.dd}"
  }
}
```

## Vector

### Конфигурация source

```toml
[sources.kiosk_agent_logs]
type = "file"
include = ["/var/log/kiosk/kiosk-agent.log"]
data_dir = "/var/lib/vector"

[sources.cloud_api_logs]
type = "file"
include = ["/var/log/kiosk/cloud-api.log"]
data_dir = "/var/lib/vector"
```

### Трансформации

```toml
[transforms.parse_json]
type = "remap"
inputs = ["kiosk_agent_logs", "cloud_api_logs"]
source = '''
  . = parse_json!(string!(.message))
'''

[transforms.filter_errors]
type = "filter"
inputs = ["parse_json"]
condition = '.level == "error" || .level == "fatal"'

[transforms.enrich]
type = "remap"
inputs = ["parse_json"]
source = '''
  .hostname = get_hostname!()
  .environment = get_env_var!("AGENT_ENV")
'''
```

### Sinks

```toml
# Output в Loki
[sinks.loki]
type = "loki"
inputs = ["enrich"]
endpoint = "http://localhost:3100"
encoding.codec = "json"
labels.service = "{{ service }}"
labels.level = "{{ level }}"
labels.environment = "{{ environment }}"

# Output в файл (для бэкапа)
[sinks.backup]
type = "file"
inputs = ["enrich"]
path = "/var/log/kiosk/backup/%Y-%m-%d.log"
encoding.codec = "json"
```

## Grep (простой поиск)

```bash
# Найти все ошибки
grep '"level":"error"' kiosk-agent.log

# Найти события конкретной сессии
grep '"sessionId":"T-20250115-001"' kiosk-agent.log

# Найти платёжные ошибки
grep '"component":"payments"' kiosk-agent.log | grep '"level":"error"'
```

## Python (для сложного анализа)

```python
import json
import sys
from datetime import datetime

# Подсчёт ошибок по компонентам
error_counts = {}

with open('kiosk-agent.log', 'r') as f:
    for line in f:
        try:
            log = json.loads(line)
            if log.get('level') == 'error':
                component = log.get('component', 'unknown')
                error_counts[component] = error_counts.get(component, 0) + 1
        except json.JSONDecodeError:
            continue

print("Errors by component:")
for component, count in sorted(error_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {component}: {count}")
```

## Grafana Loki (query language)

### LogQL примеры

```logql
# Все логи от kiosk-agent
{service="kiosk-agent"}

# Только ошибки
{service="kiosk-agent"} | json | level="error"

# Платёжные события
{service="kiosk-agent"} | json | component="payments"

# Поиск по тексту
{service="kiosk-agent"} |= "payment intent created"

# Метрики: количество ошибок в минуту
rate({service="kiosk-agent"} | json | level="error" [1m])

# Топ ошибок по компоненту
topk(5, sum by (component) (rate({service="kiosk-agent"} | json | level="error" [5m])))
```

## Splunk

### Поисковые запросы

```spl
# Все логи киоска
sourcetype="kiosk:jsonl"

# Ошибки платежей
sourcetype="kiosk:jsonl" level=error component=payments

# Статистика по сессиям
sourcetype="kiosk:jsonl" 
| stats count by sessionId 
| sort -count

# Timeline ошибок
sourcetype="kiosk:jsonl" level=error 
| timechart count by component

# Алерт на spike ошибок
sourcetype="kiosk:jsonl" level=error 
| timechart count 
| where count > 10
```

## Примеры практических задач

### Найти все события конкретной сессии с временем выполнения > 1сек

```bash
cat kiosk-agent.log | jq -c 'select(.sessionId == "T-20250115-001" and .duration > 1000)'
```

### Топ-10 самых долгих операций

```bash
cat kiosk-agent.log | jq -c 'select(.duration != null)' | jq -s 'sort_by(.duration) | reverse | .[0:10]'
```

### Экспорт ошибок в CSV

```bash
cat kiosk-agent.log | jq -r 'select(.level == "error") | [.timestamp, .component, .message, .error.code] | @csv' > errors.csv
```
