# Operations and SLA Management

Operational readiness система для мониторинга киосков, управления инцидентами и SLA метриками.

## Обзор

Модуль operations предоставляет:

- uptime-kuma self-hosted мониторинг availability и response time
- openstatus public status page для отображения состояния сервисов
- SLA framework с метриками uptime 99.5%, MTTR < 2 часа
- Incident management процедуры
- On-call playbooks для troubleshooting типовых проблем
- Health check aggregation для всех сервисов

## Компоненты

### UptimeKumaClient

API client для programmatic взаимодействия с uptime-kuma.

Методы:
- `initClient(apiUrl, apiToken)` - инициализация
- `createMonitor(monitor)` - создание monitor
- `updateMonitor(id, monitor)` - обновление monitor
- `deleteMonitor(id)` - удаление monitor
- `listMonitors()` - список monitors
- `getMonitorStatus(id)` - статус monitor
- `getMonitorHeartbeats(id, limit)` - heartbeats monitor

### OpenStatusClient

API client для обновления public status page.

Методы:
- `initClient(apiUrl, apiKey)` - инициализация
- `updatePageStatus(status)` - обновление статуса страницы
- `createIncident(incident)` - создание incident
- `updateIncident(id, update)` - обновление incident
- `resolveIncident(id)` - resolve incident
- `listIncidents()` - список incidents

### SLAManager

Расчёт uptime, downtime tracking, MTTR metrics.

Методы:
- `calculateUptime(startDate, endDate)` - расчёт uptime percentage
- `trackDowntime(startTime, endTime, reason)` - трекинг downtime
- `getMTTR(startDate, endDate)` - расчёт MTTR метрик
- `generateSLAReport(month)` - генерация SLA отчёта за месяц

SLA targets:
- Uptime: 99.5%
- Response time: < 5 минут
- MTTR: < 2 часа

### IncidentManager

Управление инцидентами: создание, классификация, response, resolution.

Методы:
- `createIncident(incident)` - создание incident
- `updateIncident(id, update)` - обновление incident
- `resolveIncident(id, resolution)` - resolve с трекингом MTTR
- `getIncidents(filters)` - список incidents с фильтрами
- `escalateIncident(id, level)` - escalation incident

### OnCallPlaybooks

Пошаговые инструкции для troubleshooting типовых проблем.

Методы:
- `getPlaybook(issueName)` - получить playbook по имени
- `listPlaybooks()` - список всех playbooks
- `createPlaybook(playbook)` - добавить новый playbook

Встроенные playbooks:
- `device_disconnected_obd` - OBD-II адаптер не подключается (10 минут)
- `payment_failure_rate_high` - Высокий процент неудачных платежей (20 минут)

### HealthCheckAggregator

Агрегация health checks из всех сервисов.

Методы:
- `getAggregatedHealth()` - агрегированное здоровье всех сервисов
- `checkServiceHealth(serviceName)` - проверка конкретного сервиса

Проверяемые сервисы:
- OBD - GET /api/obd/status (connected, responseTime < 500ms)
- Thickness - GET /api/thickness/status (connected)
- Payments - GET /api/payments/health (YooKassa reachable)
- Reports - GET /api/reports/health (SMTP доступен)

## Setup

### uptime-kuma

Docker deployment:

```bash
docker run -d -p 3001:3001 -v uptime-kuma-data:/app/data louislam/uptime-kuma:latest
```

После запуска:
1. Открыть http://localhost:3001
2. Создать аккаунт
3. Сгенерировать API token в Settings → Security
4. Добавить в .env: `UPTIME_KUMA_URL=http://localhost:3001` и `UPTIME_KUMA_TOKEN=uk_token_xxx`

Создание monitor для киоска:

```typescript
import { UptimeKumaClient } from './UptimeKumaClient.js';

const client = new UptimeKumaClient();
client.initClient(process.env.UPTIME_KUMA_URL, process.env.UPTIME_KUMA_TOKEN);

await client.createMonitor({
  name: 'kiosk_001_http',
  type: 'http',
  url: 'http://kiosk-001.local:8080/api/health',
  interval: 60,
  retryInterval: 60,
  maxRetries: 3,
  timeout: 30,
  notificationIds: []
});
```

### openstatus

SaaS setup:
1. Регистрация на openstatus.dev
2. Создание public status page
3. Получение API key
4. Добавить в .env: `OPENSTATUS_API_URL=https://api.openstatus.dev` и `OPENSTATUS_API_KEY=os_key_xxx`

Настройка сервисов:
- Толщинометрия
- OBD Диагностика
- Платежи
- Отчёты

## REST API

### GET /api/uptime/monitors

Получить список monitors.

Response: `200 OK`
```json
[
  {
    "monitorId": "mon-001",
    "name": "kiosk_001_http",
    "type": "http",
    "status": "up",
    "uptime": 99.8
  }
]
```

### POST /api/uptime/monitors

Создать monitor.

Request body: `MonitorDefinition`
Response: `201 Created`

### GET /api/uptime/monitors/:id/status

Получить статус monitor.

Response: `200 OK` - `MonitorStatus`

### GET /api/sla/uptime

Получить uptime report.

Query params:
- `startDate` (required) - ISO8601
- `endDate` (required) - ISO8601

Response: `200 OK` - `UptimeReport`

### GET /api/sla/mttr

Получить MTTR report.

Query params:
- `startDate` (required) - ISO8601
- `endDate` (required) - ISO8601

Response: `200 OK` - `MTTRReport`

### GET /api/sla/report

Получить SLA report за месяц.

Query params:
- `month` (required) - YYYY-MM

Response: `200 OK` - `SLAReport`

### POST /api/incidents

Создать incident.

Request body: `IncidentDefinition`
Response: `201 Created` - `IncidentResponse`

### PUT /api/incidents/:id

Обновить incident.

Request body: `IncidentUpdate`
Response: `200 OK` - `IncidentResponse`

### POST /api/incidents/:id/resolve

Resolve incident.

Request body:
```json
{
  "resolution": "Issue resolved by restarting service"
}
```
Response: `200 OK`

### GET /api/incidents

Получить список incidents.

Query params (optional):
- `severity` - info | warning | critical
- `status` - investigating | identified | monitoring | resolved

Response: `200 OK` - `IncidentResponse[]`

### GET /api/playbooks

Получить список playbooks.

Response: `200 OK`
```json
[
  {
    "name": "device_disconnected_obd",
    "title": "OBD-II адаптер не подключается",
    "estimatedTime": 10
  }
]
```

### GET /api/playbooks/:name

Получить playbook детали.

Response: `200 OK` - `Playbook`

### GET /api/health/aggregated

Получить агрегированное здоровье всех сервисов.

Response: `200 OK` - `AggregatedHealth`

### POST /api/status-page/update

Обновить public status page.

Request body:
```json
{
  "status": "operational" | "degraded" | "outage"
}
```
Response: `200 OK`

## Примеры использования

### Расчёт uptime

```typescript
import { SLAManager } from './SLAManager.js';

const slaManager = new SLAManager(db);
const report = await slaManager.calculateUptime(
  '2025-01-01T00:00:00Z',
  '2025-01-31T23:59:59Z'
);

console.log('Uptime:', report.uptimePercentage);
console.log('SLA met:', report.slaMet);
```

### Создание incident

```typescript
import { IncidentManager } from './IncidentManager.js';

const incidentManager = new IncidentManager(db, openStatusClient, slaManager);

const incident = await incidentManager.createIncident({
  title: 'Kiosk 001 OBD device unavailable',
  description: 'OBD-II адаптер не отвечает на команды',
  severity: 'critical',
  affectedServices: ['OBD Diagnostics'],
  status: 'investigating',
  startedAt: new Date().toISOString()
});

console.log('Incident created:', incident.incidentId);
```

### Получение playbook

```typescript
import { OnCallPlaybooks } from './OnCallPlaybooks.js';

const playbooks = new OnCallPlaybooks();
const playbook = await playbooks.getPlaybook('device_disconnected_obd');

console.log('Playbook:', playbook.title);
console.log('Estimated time:', playbook.estimatedTime, 'minutes');
console.log('Diagnosis steps:', playbook.diagnosis);
console.log('Resolution steps:', playbook.resolution);
```

## Интеграции

### Промпт 7 (Monitoring)

Alerts из Prometheus триггерят создание incidents:

```typescript
// Alert webhook handler
router.post('/alerts/webhook', async (req, res) => {
  const alert = req.body;
  if (alert.status === 'firing') {
    await incidentManager.createIncident({
      title: alert.labels.alertname,
      description: alert.annotations.description,
      severity: alert.labels.severity,
      affectedServices: [alert.labels.service],
      status: 'investigating',
      startedAt: alert.startsAt
    });
  }
});
```

### Промпт 14 (Workflows)

Auto-remediation workflows для incidents:

```typescript
// Trigger auto-remediation
await workflowsClient.triggerWorkflow('auto-remediate-obd-disconnect', {
  incidentId: incident.incidentId,
  kioskId: 'kiosk-001'
});
```

### Промпт 11 (Analytics)

Downtime aggregation для SLA reports через DuckDB:

```sql
SELECT 
  DATE_TRUNC('day', start_time) as day,
  SUM(EPOCH(end_time) - EPOCH(start_time)) as total_downtime_seconds
FROM downtime
WHERE start_time >= '2025-01-01'
GROUP BY day;
```

### Промпт 12 (Admin Console)

SLA dashboard и incident management UI в admin-console для операторов.

## Метрики

Prometheus metrics:

- `uptime_monitors_total` (gauge) - количество monitors
- `uptime_monitor_status` (gauge) - статус monitor {monitorId, status}
- `incidents_created_total` (counter) - созданные incidents {severity}
- `incidents_resolved_total` (counter) - resolved incidents {severity}
- `incident_resolution_duration_seconds` (histogram) - MTTR {severity}
- `sla_uptime_percentage` (gauge) - текущий uptime percentage
- `sla_met` (gauge) - 1 если SLA met, 0 если breach

## Безопасность

- uptime-kuma UI: ограничить доступ firewall по внутренним IP, strong password, API token rotation
- openstatus: публичные incidents без технических деталей, задержанная публикация, private mode при необходимости
- downtime data: доступ только admin, шифрование в БД
- playbooks: доступ только аутентифицированным операторам, audit trail открытия

## Troubleshooting

### uptime-kuma недоступен

Проверить Docker контейнер:
```bash
docker ps | grep uptime-kuma
docker logs <container-id>
```

Restart:
```bash
docker restart <container-id>
```

### openstatus API 401

Проверить API key:
- Убедиться что OPENSTATUS_API_KEY в .env
- Проверить срок действия ключа на openstatus.dev
- Сгенерировать новый ключ при необходимости

### SLA calculation неправильный

Проверить downtime records:
```sql
SELECT * FROM downtime WHERE end_time IS NULL;
```

Закрыть открытые downtime records:
```typescript
await slaManager.trackDowntime(startTime, new Date().toISOString(), 'Manual close');
```

### Playbook не найден

Проверить имя playbook:
```typescript
const playbooks = await onCallPlaybooks.listPlaybooks();
console.log(playbooks.map(p => p.name));
```

## Конфигурация

ENV переменные (.env):

```env
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_TOKEN=uk_token_xxxxxxxx
OPENSTATUS_API_URL=https://api.openstatus.dev
OPENSTATUS_API_KEY=os_key_xxxxxxxx
SLA_UPTIME_TARGET=99.5
SLA_RESPONSE_TIME_TARGET=300
SLA_MTTR_TARGET=7200
```

## База данных

Необходимые таблицы:

```sql
CREATE TABLE downtime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE incidents (
  incident_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  affected_services TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT,
  escalation_level INTEGER,
  escalated_at TEXT,
  updates TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_downtime_start ON downtime(start_time);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity);
```

## Тесты

Запуск unit tests:
```bash
npm test -- src/operations/tests/*.test.ts
```

Запуск integration tests (требуется Docker uptime-kuma):
```bash
npm test -- src/operations/tests/integration/*.test.ts
```

Запуск E2E tests:
```bash
npm test -- src/operations/tests/e2e/*.test.ts
```
