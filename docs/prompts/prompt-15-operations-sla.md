# Промпт 15 эксплуатация и SLA

ЦЕЛЬ
- Operational readiness: uptime-kuma (self-hosted) мониторинг uptime/availability/response time киосков; openstatus public status page (текущее состояние services); SLA: 99.5% uptime, response time < 5 минут, MTTR < 2 часов; incident management (обнаружение/классификация/реагирование/resolution/коммуникация); on-call playbooks (пошаговые инструкции, escalation paths); агрегатор /api/health /api/ready (из промптов 1–14); downtime tracking; SLA reporting (ежемесячные отчёты); alerting thresholds; интеграция: промпт 7 (monitoring), промпт 14 (workflows auto-remediation). Цель: гарантия качества, быстрое восстановление, прозрачность статуса, соответствие SLA commitments.

КОНТЕКСТ
- Услуги: толщинометрия, OBD-диагностика. Ожидания: высокая доступность (оборудование, оплата, отчёты). Проблема: нет формального SLA, public status page, процедур инцидентов, SLA reporting. Решение: uptime-kuma (HTTP/ping/TCP checks), openstatus (public page), SLAManager (uptime/MTTR/incidents), IncidentManager (процедуры), OnCallPlaybooks (guides). Интеграции: alerts в промпт 7 и промпт 14; openstatus обновляется по API; отчётность — из промпта 11 (DuckDB).

ГРАНИЦЫ
- Внутри: UptimeKumaClient; OpenStatusClient; SLAManager; IncidentManager; OnCallPlaybooks; HealthCheckAggregator (/api/health /api/ready); SLA reporting; REST API: uptime/sla/incidents/playbooks/status-page.
- Вне: внешние мониторинги (Pingdom/UptimeRobot) — нет; тикетинг — будущее; финштрафы — вне scope (только reporting). Интеграции: промпт 7 (Prometheus), промпт 14 (Activepieces), промпт 11 (DuckDB), промпт 12 (admin-console).

АРХИТЕКТУРА

МОДУЛЬ UptimeKumaClient (apps/kiosk-agent/src/operations/UptimeKumaClient.ts)
- Методы: initClient(apiUrl, apiToken); createMonitor(monitor); updateMonitor(id, monitor); deleteMonitor(id); listMonitors(); getMonitorStatus(id); getMonitorHeartbeats(id, limit).
- MonitorDefinition: name string (уникальное, напр. kiosk_001_http); type 'http'|'ping'|'tcp'|'dns'; url string? (для http/tcp); interval number (сек); retryInterval number (сек); maxRetries number; timeout number (сек); notificationIds string[].
- MonitorResponse: monitorId string (UUID); name string; type string; status 'up'|'down'|'pending'; uptime number (% 24h); createdAt ISO8601.
- MonitorStatus: monitorId string; status 'up'|'down'|'pending'; lastCheckAt ISO8601; responseTime ms; uptime24h %, uptime7d %, uptime30d %.
- Heartbeat: timestamp ISO8601; status 'up'|'down'; responseTime ms?; message string?.
- Инициализация: Docker louislam/uptime-kuma:latest:3001, persistent volume; API token через UI; monitors на /api/health.
```typescript
async createMonitor(monitor: MonitorDefinition): Promise<MonitorResponse> {
  const response = await axios.post(`${this.apiUrl}/api/monitor`, monitor, {
    headers: { Authorization: `Bearer ${this.apiToken}` }
  });
  return response.data;
}
```

МОДУЛЬ OpenStatusClient (apps/kiosk-agent/src/operations/OpenStatusClient.ts)
- Методы: initClient(apiUrl, apiKey); updatePageStatus('operational'|'degraded'|'outage'); createIncident(incident); updateIncident(id, update); resolveIncident(id); listIncidents().
- IncidentDefinition: title; description; severity 'info'|'warning'|'critical'; affectedServices string[]; status 'investigating'|'identified'|'monitoring'|'resolved'; startedAt ISO8601.
- IncidentUpdate: description; status; timestamp ISO8601.
- IncidentResponse: incidentId UUID; title; status; createdAt ISO8601; resolvedAt ISO8601?; updates IncidentUpdate[].
- Инициализация: SaaS openstatus.dev, API key, services: Толщинометрия, OBD Диагностика, Платежи, Отчёты.
```typescript
async updatePageStatus(status: 'operational'|'degraded'|'outage'): Promise<void> {
  await axios.post(`${this.apiUrl}/api/page/status`, { status }, { headers: { Authorization: `Bearer ${this.apiKey}` } });
}
async createIncident(incident: IncidentDefinition): Promise<IncidentResponse> {
  const r = await axios.post(`${this.apiUrl}/api/incidents`, incident, { headers: { Authorization: `Bearer ${this.apiKey}` } });
  return r.data;
}
```

МОДУЛЬ SLAManager (apps/kiosk-agent/src/operations/SLAManager.ts)
- Методы: calculateUptime(startDate, endDate): Promise<UptimeReport>; trackDowntime(startTime, endTime, reason); getMTTR(startDate, endDate): Promise<MTTRReport>; generateSLAReport(month): Promise<SLAReport>.
- UptimeReport: totalTime s; uptime s; downtime s; uptimePercentage %; incidentsCount; slaTarget 99.5; slaMet boolean.
- MTTRReport: incidents[{incidentId, detectedAt, resolvedAt, duration}]; averageMTTR s; medianMTTR s; maxMTTR s; mttrTarget 7200; mttrMet boolean.
- SLAReport: month YYYY-MM; uptimePercentage %; slaMet; incidentsCount; mttr s; downtime[{startTime, endTime, duration, reason}].
```typescript
async calculateUptime(startDate: string, endDate: string): Promise<UptimeReport> {
  const total = new Date(endDate).getTime() - new Date(startDate).getTime();
  const rows = await this.db.query('SELECT start_time, end_time FROM downtime WHERE start_time >= ? AND end_time <= ?', [startDate, endDate]);
  const down = rows.reduce((s, r) => s + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()), 0);
  const up = total - down; const pct = (up / total) * 100;
  return { totalTime: total/1000, uptime: up/1000, downtime: down/1000, uptimePercentage: pct, incidentsCount: rows.length, slaTarget: 99.5, slaMet: pct >= 99.5 };
}
```

МОДУЛЬ IncidentManager (apps/kiosk-agent/src/operations/IncidentManager.ts)
- Методы: createIncident(incident): Promise<IncidentResponse>; updateIncident(id, update): Promise<IncidentResponse>; resolveIncident(id, resolution): Promise<void>; getIncidents(filters): Promise<IncidentResponse[]>; escalateIncident(id, escalationLevel): Promise<void>.
```typescript
async createIncident(i: IncidentDefinition): Promise<IncidentResponse> {
  const rec = await this.db.insert('incidents', i);
  await this.openStatusClient.createIncident(i);
  await this.slaManager.trackDowntime(i.startedAt, null, i.title);
  this.metricsService.incrementCounter('incidents_created_total', { severity: i.severity });
  return rec;
}
async resolveIncident(id: string, resolution: string): Promise<void> {
  const inc = await this.db.findById('incidents', id); const resolvedAt = new Date().toISOString();
  await this.db.update('incidents', id, { status: 'resolved', resolvedAt, resolution });
  await this.slaManager.trackDowntime(inc.startedAt, resolvedAt, inc.title);
  await this.openStatusClient.resolveIncident(id);
  const duration = new Date(resolvedAt).getTime() - new Date(inc.startedAt).getTime();
  this.metricsService.observeHistogram('incident_resolution_duration_seconds', duration/1000, { severity: inc.severity });
}
```

МОДУЛЬ OnCallPlaybooks (apps/kiosk-agent/src/operations/OnCallPlaybooks.ts)
- Методы: getPlaybook(issueName): Promise<Playbook|null>; listPlaybooks(): Promise<Playbook[]>; createPlaybook(playbook): Promise<void>.
- Playbook: name; title; symptoms string[]; diagnosis DiagnosisStep[]; resolution ResolutionStep[]; escalation string; estimatedTime minutes.
- DiagnosisStep: step; command?; expectedOutput. ResolutionStep: step; command?; note?.
- Пример 1 (OBD device disconnected):
```typescript
{
  name: 'device_disconnected_obd', title: 'OBD-II адаптер не подключается',
  symptoms: ['Алерт device_disconnected severity critical', 'GET /api/obd/status возвращает {"connected": false}', 'Клиент не может начать диагностику'],
  diagnosis: [
    { step: 'Проверить физическое подключение адаптера к киоску', command: null, expectedOutput: 'Кабель подключён к USB порту' },
    { step: 'Проверить доступность COM порта', command: 'mode', expectedOutput: 'COM3 доступен' },
    { step: 'Проверить статус в приложении', command: 'curl http://localhost:8080/api/obd/status', expectedOutput: '{"connected": true}' }
  ],
  resolution: [
    { step: 'Переподключить USB кабель адаптера', command: null, note: 'Ожидать 10 секунд после переподключения' },
    { step: 'Перезапустить kiosk-agent', command: 'POST /api/kiosks/:id/restart', note: 'Через admin-console или API' },
    { step: 'Если не помогло заменить адаптер на запасной', command: null, note: 'Запасной адаптер в киоске ящик A' }
  ],
  escalation: 'Если resolution не помогла в течение 15 минут escalate к senior operator или tech support', estimatedTime: 10
}
```
- Пример 2 (Payment failure rate высокий):
```typescript
{
  name: 'payment_failure_rate_high', title: 'Высокий процент неудачных платежей',
  symptoms: ['Алерт payment_failure_rate более 10%', 'Клиенты жалуются на failed payments'],
  diagnosis: [
    { step: 'Проверить статус YooKassa API', command: 'curl https://api.yookassa.ru/health', expectedOutput: '200 OK' },
    { step: 'Проверить интернет соединение киоска', command: 'ping 8.8.8.8', expectedOutput: 'Packets received 4/4' },
    { step: 'Проверить логи ошибок платежей', command: 'GET /api/payments/errors?limit=10', expectedOutput: 'Error codes' }
  ],
  resolution: [
    { step: 'Если YooKassa down ожидать восстановления', command: null, note: 'Проверить status.yookassa.ru' },
    { step: 'Если интернет проблемы перезагрузить роутер', command: null, note: 'Роутер в техническом помещении' },
    { step: 'Если логи показывают invalid credentials обновить API key', command: 'PUT /api/kiosks/:id/config yookassaShopId yookassaApiKey', note: null }
  ],
  escalation: 'Если payments не восстанавливаются в течение 30 минут escalate к финансовому отделу', estimatedTime: 20
}
```

МОДУЛЬ HealthCheckAggregator (apps/kiosk-agent/src/operations/HealthCheckAggregator.ts)
- Методы: getAggregatedHealth(): Promise<AggregatedHealth>; checkServiceHealth(serviceName): Promise<ServiceHealth>.
- AggregatedHealth: status 'healthy'|'degraded'|'unhealthy'; services ServiceHealth[]; timestamp ISO8601.
- ServiceHealth: name 'OBD'|'Thickness'|'Payments'|'Reports'; status 'healthy'|'unhealthy'; responseTime ms?; message?.
- Логика:
```typescript
async getAggregatedHealth(): Promise<AggregatedHealth> {
  const services = ['OBD','Thickness','Payments','Reports'];
  const checks = await Promise.all(services.map(s => this.checkServiceHealth(s)));
  const allHealthy = checks.every(h => h.status === 'healthy');
  const anyUnhealthy = checks.some(h => h.status === 'unhealthy');
  return { status: allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded', services: checks, timestamp: new Date().toISOString() };
}
```
- CheckServiceHealth: OBD — GET /api/obd/status (connected true, responseTime < 500ms); Thickness — GET /api/thickness/status (connected true); Payments — GET /api/payments/health (YooKassa reachable); Reports — GET /api/reports/health (SMTP доступен).

REST API (однострочные описания)
- GET /api/uptime/monitors — список monitors; 200 JSON: [{"monitorId":"mon-001","name":"kiosk_001_http","type":"http","status":"up","uptime":99.8}]
- POST /api/uptime/monitors — создать monitor; body: MonitorDefinition; 201
- GET /api/uptime/monitors/:id/status — статус monitor; 200 JSON: MonitorStatus
- GET /api/sla/uptime — uptime report; q: startDate,endDate; 200 JSON: UptimeReport
- GET /api/sla/mttr — MTTR report; q: startDate,endDate; 200 JSON: MTTRReport
- GET /api/sla/report — SLA report за месяц; q: month=YYYY-MM; 200 JSON: SLAReport
- POST /api/incidents — создать incident; body: IncidentDefinition; 201 JSON: IncidentResponse
- PUT /api/incidents/:id — обновить incident; body: IncidentUpdate; 200 JSON
- POST /api/incidents/:id/resolve — resolve; body: {resolution}; 200
- GET /api/playbooks — список playbooks; 200 JSON: [{"name":"device_disconnected_obd","title":"OBD-II адаптер не подключается","estimatedTime":10}]
- GET /api/playbooks/:name — playbook детали; 200 JSON: Playbook
- GET /api/health/aggregated — агрегированное здоровье; 200 JSON: AggregatedHealth
- POST /api/status-page/update — обновить public status page; body: {status:'operational'|'degraded'|'outage'}; 200

ТЕСТЫ

Юнит (apps/kiosk-agent/src/operations/tests/)
- UptimeKumaClient.test.ts — createMonitor вызывает API и возвращает MonitorResponse; getMonitorStatus => status up
- SLAManager.test.ts — calculateUptime считает percentage; trackDowntime сохраняет запись; getMTTR считает average MTTR
- IncidentManager.test.ts — createIncident сохраняет в БД и обновляет openstatus; resolveIncident считает duration и обновляет downtime
- OnCallPlaybooks.test.ts — getPlaybook по имени; listPlaybooks возвращает все

Интеграционные (apps/kiosk-agent/src/operations/tests/integration/)
- uptime-kuma-integration.test.ts — Docker uptime-kuma поднят; createMonitor создаёт; getMonitorStatus => uptime 100% если kiosk up
- openstatus-integration.test.ts — updatePageStatus обновляет public page; createIncident публикует; resolveIncident закрывает
- sla-calculation.test.ts — trackDowntime 2 часа; calculateUptime за месяц => uptimePercentage 99.7; slaMet true при 99.5 target

E2E (apps/kiosk-agent/src/operations/tests/e2e/)
- full-sla-flow.test.ts — POST /api/incidents => старт downtime; alert в промпт 7; промпт 14 auto-remediation; resolve; calculateUptime => SLA met
- playbook-execution.test.ts — device_disconnected алерт; оператор открывает device_disconnected_obd; следует шагам; resolved; MTTR < 15 минут
- status-page-update.test.ts — kiosk down детектирован; updatePageStatus => degraded; createIncident в openstatus; восстановление => operational; resolveIncident

ДОКУМЕНТАЦИЯ (apps/kiosk-agent/src/operations/README.md)
- Обзор: uptime-kuma, openstatus, SLA, incident mgmt, playbooks
- Setup: uptime-kuma (Docker 3001, API token, HTTP checks); openstatus (public page, API key, services)
- SLA: uptime 99.5%, response < 5 мин, MTTR < 2 ч
- Incident Mgmt: процедуры и API
- Playbooks: device_disconnected, payment_failure_rate; диагностика/resolution/escalation
- Health: /api/health/aggregated; проверки OBD/Thickness/Payments/Reports
- Reporting: calculateUptime/getMTTR/generateSLAReport; ежемесячные отчёты
- Integration: промпт 7/14/11/12
- Troubleshooting: недоступен uptime-kuma — проверить Docker; openstatus 401 — API key; SLA calculation — проверить downtime; playbook — проверить name

ПРИМЕРЫ
```typescript
// apps/kiosk-agent/src/operations/uptime-kuma-init.ts
import { UptimeKumaClient } from './UptimeKumaClient.js';
const uptimeKumaClient = new UptimeKumaClient();
uptimeKumaClient.initClient('http://localhost:3001', process.env.UPTIME_KUMA_TOKEN);
const monitor = await uptimeKumaClient.createMonitor({
  name: 'kiosk_001_http', type: 'http', url: 'http://kiosk-001.local:8080/api/health',
  interval: 60, retryInterval: 60, maxRetries: 3, timeout: 30, notificationIds: []
});
console.log('Monitor created:', monitor.monitorId);
```
```typescript
// apps/kiosk-agent/src/operations/calculate-uptime-example.ts
import { SLAManager } from './SLAManager.js';
const slaManager = new SLAManager();
const uptimeReport = await slaManager.calculateUptime('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');
console.log('Uptime percentage:', uptimeReport.uptimePercentage);
console.log('SLA met:', uptimeReport.slaMet);
```
```typescript
// apps/kiosk-agent/src/operations/create-incident-example.ts
import { IncidentManager } from './IncidentManager.js';
const incidentManager = new IncidentManager();
const incident = await incidentManager.createIncident({
  title: 'Kiosk 001 OBD device unavailable', description: 'OBD-II адаптер не отвечает на команды',
  severity: 'critical', affectedServices: ['OBD Diagnostics'], status: 'investigating', startedAt: new Date().toISOString()
});
console.log('Incident created:', incident.incidentId);
```
```typescript
// apps/kiosk-agent/src/operations/get-playbook-example.ts
import { OnCallPlaybooks } from './OnCallPlaybooks.js';
const onCallPlaybooks = new OnCallPlaybooks();
const playbook = await onCallPlaybooks.getPlaybook('device_disconnected_obd');
console.log('Playbook:', playbook.title);
console.log('Estimated time:', playbook.estimatedTime, 'minutes');
console.log('Steps:', playbook.resolution);
```

КОНФИГУРАЦИЯ
```env
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_TOKEN=uk_token_xxxxxxxx
OPENSTATUS_API_URL=https://api.openstatus.dev
OPENSTATUS_API_KEY=os_key_xxxxxxxx
SLA_UPTIME_TARGET=99.5
SLA_RESPONSE_TIME_TARGET=300
SLA_MTTR_TARGET=7200
```
```bash
docker run -d -p 3001:3001 -v uptime-kuma-data:/app/data louislam/uptime-kuma:latest
```

БЕЗОПАСНОСТЬ
- uptime-kuma UI: ограничить доступ FW по внутренним IP, пароль, API token; openstatus: публичные инциденты — общие описания, без техдеталей, задержанная публикация, private mode при необходимости; downtime data: доступ только admin, шифрование в БД; playbooks: доступ только аутентифицированным операторам, аудит открытия.

МЕТРИКИ
- uptime_monitors_total gauge; uptime_monitor_status gauge{monitorId,status}; incidents_created_total counter{severity}; incidents_resolved_total counter{severity}; incident_resolution_duration_seconds histogram{severity}; sla_uptime_percentage gauge; sla_met gauge (1/0).

РИСКИ
- uptime-kuma SPOF — решение: HA деплой, фолбэк на health checks промпта 7, резервный внешний мониторинг; точность SLA — автотрекинг heartbeats, manual override, аудит downtime; устаревание playbooks — квартальный ревью, версионирование в Git, фидбек операторов; задержка status page — автообновления по API, webhooks uptime-kuma → openstatus.

ROADMAP
- Фаза 1 (1 неделя): uptime-kuma + SLA calc; задачи: UptimeKumaClient (createMonitor/getMonitorStatus), SLAManager (calculateUptime/trackDowntime/getMTTR), REST API, unit/integration (Docker).
- Фаза 2 (1 неделя): Incident mgmt + openstatus; задачи: IncidentManager (create/resolve), OpenStatusClient (update/create), интеграция с промпт 14, метрики incidents_*.
- Фаза 3 (1 неделя): Playbooks + admin UI; задачи: OnCallPlaybooks, HealthCheckAggregator, SLA dashboard, E2E, документация.

КРИТЕРИИ ACCEPTANCE
1) UptimeKumaClient создаёт monitors и получает status/uptime/heartbeats
2) SLAManager считает uptime%/MTTR и генерирует SLA reports
3) IncidentManager создаёт/классифицирует/resolve с downtime tracking
4) OpenStatusClient обновляет public status page и публикует incidents
5) OnCallPlaybooks предоставляет playbooks (diagnosis/resolution/escalation)
6) HealthCheckAggregator возвращает агрегированный health OBD/Thickness/Payments/Reports
7) REST API endpoints доступны (uptime/sla/incidents/playbooks/status-page/health)
8) Метрики uptime_* incidents_* sla_* в Prometheus
9) Интеграция промпт 7 — alerts триггерят incident creation
10) Интеграция промпт 14 — авто-remediation на incidents
11) Интеграция промпт 11 — downtime aggregation для SLA reports
12) Интеграция промпт 12 — SLA dashboard и incident UI
13) Unit coverage > 80%
14) Интеграционные тесты uptime-kuma/openstatus/sla-calculation проходят
15) E2E full-sla-flow/playbook-execution/status-page-update проходят

ИТОГ
- Внедряется operational readiness: uptime-kuma мониторинг, openstatus публичная страница, SLA (99.5%/5 мин/2 ч), incident management и on-call playbooks. Интеграции с промптами 1–14 обеспечивают end-to-end надёжность: агрегированные health checks (/api/health/aggregated), автоматический downtime tracking (heartbeats), alerts → workflows auto-remediation, SLA reports (DuckDB), SLA dashboard (admin-console). Результат: предсказуемое качество услуг, скорость восстановления, прозрачность статуса и соблюдение SLA.
Playbook interface:

- name string уникальное имя например device_disconnected_obd
- title string краткое описание
- symptoms array string признаки проблемы
- diagnosis array DiagnosisStep шаги диагностики
- resolution array ResolutionStep шаги решения
- escalation string когда и к кому escalate
- estimatedTime number minutes время на resolution

DiagnosisStep interface:

- step string описание шага
- command string optional команда для выполнения
- expectedOutput string что должно быть

ResolutionStep interface:

- step string описание
- command string optional
- note string optional предостережения

Playbook examples:

Playbook 1: Device disconnected OBD

```typescript
{
  name: 'device_disconnected_obd',
  title: 'OBD-II адаптер не подключается',
  symptoms: [
    'Алерт device_disconnected severity critical',
    'GET /api/obd/status возвращает {"connected": false}',
    'Клиент не может начать диагностику'
  ],
  diagnosis: [
    { step: 'Проверить физическое подключение адаптера к киоску', command: null, expectedOutput: 'Кабель подключён к USB порту' },
    { step: 'Проверить доступность COM порта', command: 'mode', expectedOutput: 'COM3 доступен' },
    { step: 'Проверить статус в приложении', command: 'curl http://localhost:8080/api/obd/status', expectedOutput: '{"connected": true}' }
  ],
  resolution: [
    { step: 'Переподключить USB кабель адаптера', command: null, note: 'Ожидать 10 секунд после переподключения' },
    { step: 'Перезапустить kiosk-agent', command: 'POST /api/kiosks/:id/restart', note: 'Через admin-console или API' },
    { step: 'Если не помогло заменить адаптер на запасной', command: null, note: 'Запасной адаптер в киоске ящик A' }
  ],
  escalation: 'Если resolution не помогла в течение 15 минут escalate к senior operator или tech support',
  estimatedTime: 10
}
```

Playbook 2: Payment failure rate высокий

```typescript
{
  name: 'payment_failure_rate_high',
  title: 'Высокий процент неудачных платежей',
  symptoms: [
    'Алерт payment_failure_rate более 10%',
    'Клиенты жалуются на failed payments'
  ],
  diagnosis: [
    { step: 'Проверить статус YooKassa API', command: 'curl https://api.yookassa.ru/health', expectedOutput: '200 OK' },
    { step: 'Проверить интернет соединение киоска', command: 'ping 8.8.8.8', expectedOutput: 'Packets received 4/4' },
    { step: 'Проверить логи ошибок платежей', command: 'GET /api/payments/errors?limit=10', expectedOutput: 'Error codes' }
  ],
  resolution: [
    { step: 'Если YooKassa down ожидать восстановления', command: null, note: 'Проверить status.yookassa.ru' },
    { step: 'Если интернет проблемы перезагрузить роутер', command: null, note: 'Роутер в техническом помещении' },
    { step: 'Если логи показывают invalid credentials обновить API key', command: 'PUT /api/kiosks/:id/config yookassaShopId yookassaApiKey', note: null }
  ],
  escalation: 'Если payments не восстанавливаются в течение 30 минут escalate к финансовому отделу',
  estimatedTime: 20
}
```

МОДУЛЬ HealthCheckAggregator
Файл apps/kiosk-agent/src/operations/HealthCheckAggregator.ts
Класс HealthCheckAggregator методы:

- getAggregatedHealth returns Promise AggregatedHealth
- checkServiceHealth serviceName string returns Promise ServiceHealth

AggregatedHealth interface:

- status healthy|degraded|unhealthy
- services array ServiceHealth
- timestamp string ISO8601

ServiceHealth interface:

- name string OBD Thickness Payments Reports
- status healthy|unhealthy
- responseTime number ms optional
- message string optional error message

Логика getAggregatedHealth:

```typescript
async getAggregatedHealth(): Promise<AggregatedHealth> {
  const services = ['OBD', 'Thickness', 'Payments', 'Reports'];
  const healthChecks = await Promise.all(services.map(s => this.checkServiceHealth(s)));

  const allHealthy = healthChecks.every(h => h.status === 'healthy');
  const anyUnhealthy = healthChecks.some(h => h.status === 'unhealthy');

  const status = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

  return {
    status,
    services: healthChecks,
    timestamp: new Date().toISOString()
  };
}
```

checkServiceHealth процесс:

- OBD: GET /api/obd/status проверка connected true, responseTime менее 500ms
- Thickness: GET /api/thickness/status проверка connected true
- Payments: GET /api/payments/health проверка YooKassa reachable
- Reports: GET /api/reports/health проверка SMTP доступен

REST API

GET /api/uptime/monitors
Получить список monitors
Ответ: 200 OK application/json

```json
[
  {"monitorId": "mon-001", "name": "kiosk_001_http", "type": "http", "status": "up", "uptime": 99.8}
]
```

POST /api/uptime/monitors
Создать monitor
Запрос: application/json MonitorDefinition
Ответ: 201 Created

GET /api/uptime/monitors/:id/status
Получить monitor status
Ответ: 200 OK application/json MonitorStatus

GET /api/sla/uptime
Получить uptime report
Query params: startDate endDate
Ответ: 200 OK application/json UptimeReport

GET /api/sla/mttr
Получить MTTR report
Query params: startDate endDate
Ответ: 200 OK application/json MTTRReport

GET /api/sla/report
Получить SLA report за месяц
Query params: month YYYY-MM
Ответ: 200 OK application/json SLAReport

POST /api/incidents
Создать incident
Запрос: application/json IncidentDefinition
Ответ: 201 Created IncidentResponse

PUT /api/incidents/:id
Обновить incident
Запрос: application/json IncidentUpdate
Ответ: 200 OK

POST /api/incidents/:id/resolve
Resolve incident
Запрос: application/json {resolution: string}
Ответ: 200 OK

GET /api/playbooks
Получить список playbooks
Ответ: 200 OK application/json

```json
[
  {"name": "device_disconnected_obd", "title": "OBD-II адаптер не подключается", "estimatedTime": 10}
]
```

GET /api/playbooks/:name
Получить playbook детали
Ответ: 200 OK application/json Playbook

GET /api/health/aggregated
Получить aggregated health всех сервисов
Ответ: 200 OK application/json AggregatedHealth

POST /api/status-page/update
Обновить public status page
Запрос: application/json {status: operational|degraded|outage}
Ответ: 200 OK

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/operations/tests/

- UptimeKumaClient.test.ts: createMonitor вызывает API и возвращает MonitorResponse, getMonitorStatus возвращает статус up
- SLAManager.test.ts: calculateUptime вычисляет uptime percentage, trackDowntime сохраняет downtime record, getMTTR вычисляет average MTTR
- IncidentManager.test.ts: createIncident сохраняет в БД и обновляет openstatus, resolveIncident вычисляет duration и обновляет downtime
- OnCallPlaybooks.test.ts: getPlaybook возвращает playbook по имени, listPlaybooks возвращает все playbooks

Интеграционные тесты apps/kiosk-agent/src/operations/tests/integration/

- uptime-kuma-integration.test.ts: Docker контейнер uptime-kuma запущен, createMonitor создаёт monitor, getMonitorStatus возвращает uptime 100% если kiosk up
- openstatus-integration.test.ts: updatePageStatus обновляет public page, createIncident создаёт incident на status page, resolveIncident закрывает incident
- sla-calculation.test.ts: trackDowntime сохраняет 2 часа downtime, calculateUptime за месяц возвращает uptimePercentage 99.7, slaMet true если 99.5 target

E2E тесты apps/kiosk-agent/src/operations/tests/e2e/

- full-sla-flow.test.ts: создание incident через POST /api/incidents, downtime tracking начинается, alert триггерится в промпт 7, workflow промпт 14 auto-remediation выполняется, incident resolve через POST /api/incidents/:id/resolve, calculateUptime вычисляет SLA met
- playbook-execution.test.ts: device_disconnected алерт триггерится, operator открывает playbook device_disconnected_obd, следует diagnosis steps, выполняет resolution steps, incident resolved, MTTR менее 15 минут
- status-page-update.test.ts: kiosk down детектируется uptime-kuma, updatePageStatus устанавливает degraded, createIncident публикует на openstatus, kiosk восстановлен, updatePageStatus устанавливает operational, resolveIncident

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/operations/README.md
Секции:

- Обзор: operational readiness uptime-kuma openstatus SLA framework incident management on-call playbooks
- uptime-kuma Setup: Docker deployment louislam/uptime-kuma:latest порт 3001, API token generation, monitor creation для киосков HTTP checks
- openstatus Setup: регистрация openstatus.dev public status page, API key, services Толщинометрия OBD Платежи Отчёты
- SLA Definitions: uptime target 99.5%, response time target менее 5 минут, MTTR target менее 2 часов
- Incident Management: создание классификация response resolution procedures, IncidentManager API
- On-Call Playbooks: пошаговые инструкции для common issues device_disconnected payment_failure_rate, диагностика resolution escalation
- Health Check Aggregation: /api/health/aggregated endpoint, checkServiceHealth OBD Thickness Payments Reports
- SLA Reporting: ежемесячные отчёты calculateUptime getMTTR generateSLAReport, compliance percentages
- Integration: промпт 7 monitoring alerts, промпт 14 workflows auto-remediation, промпт 11 analytics downtime aggregation, промпт 12 admin-console SLA dashboard
- Troubleshooting: uptime-kuma не доступен проверить Docker контейнер, openstatus API 401 проверить API key, SLA calculation неправильный проверить downtime records, playbook не найден проверить name

ПРИМЕРЫ

Пример инициализация UptimeKumaClient

```typescript
// apps/kiosk-agent/src/operations/uptime-kuma-init.ts
import { UptimeKumaClient } from './UptimeKumaClient.js';

const uptimeKumaClient = new UptimeKumaClient();
uptimeKumaClient.initClient('http://localhost:3001', process.env.UPTIME_KUMA_TOKEN);

const monitor = await uptimeKumaClient.createMonitor({
  name: 'kiosk_001_http',
  type: 'http',
  url: 'http://kiosk-001.local:8080/api/health',
  interval: 60,
  retryInterval: 60,
  maxRetries: 3,
  timeout: 30,
  notificationIds: []
});

console.log('Monitor created:', monitor.monitorId);
```

Пример calculate uptime

```typescript
// apps/kiosk-agent/src/operations/calculate-uptime-example.ts
import { SLAManager } from './SLAManager.js';

const slaManager = new SLAManager();

const uptimeReport = await slaManager.calculateUptime('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

console.log('Uptime percentage:', uptimeReport.uptimePercentage);
console.log('SLA met:', uptimeReport.slaMet);
```

Пример create incident

```typescript
// apps/kiosk-agent/src/operations/create-incident-example.ts
import { IncidentManager } from './IncidentManager.js';

const incidentManager = new IncidentManager();

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

Пример get playbook

```typescript
// apps/kiosk-agent/src/operations/get-playbook-example.ts
import { OnCallPlaybooks } from './OnCallPlaybooks.js';

const onCallPlaybooks = new OnCallPlaybooks();

const playbook = await onCallPlaybooks.getPlaybook('device_disconnected_obd');

console.log('Playbook:', playbook.title);
console.log('Estimated time:', playbook.estimatedTime, 'minutes');
console.log('Steps:', playbook.resolution);
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
UPTIME_KUMA_URL=http://localhost:3001
UPTIME_KUMA_TOKEN=uk_token_xxxxxxxx
OPENSTATUS_API_URL=https://api.openstatus.dev
OPENSTATUS_API_KEY=os_key_xxxxxxxx
SLA_UPTIME_TARGET=99.5
SLA_RESPONSE_TIME_TARGET=300
SLA_MTTR_TARGET=7200
```

uptime-kuma Docker deployment:

```bash
docker run -d \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:latest
```

БЕЗОПАСНОСТЬ

uptime-kuma access: публичный доступ к UI позволяет видеть все monitors. Решение: firewall allow только internal IPs, password protect UI, API token для programmatic access
openstatus public page: показывает incidents публично может раскрыть internal issues. Решение: generic descriptions инцидентов без технических деталей, delayed публикация после resolution, private mode для sensitive incidents
Downtime data: содержит информацию о инцидентах может быть sensitive. Решение: ограниченный доступ к SLA reports только admins, шифрование downtime records в БД
Playbooks: содержат команды и процедуры могут быть использованы для атак. Решение: доступ к playbooks только authenticated operators, audit logging кто и когда открывал playbooks

МЕТРИКИ

uptime_monitors_total gauge: количество активных uptime monitors
uptime_monitor_status gauge labels monitorId status up|down: текущий статус monitors
incidents_created_total counter labels severity info|warning|critical: количество созданных incidents
incidents_resolved_total counter labels severity: количество resolved incidents
incident_resolution_duration_seconds histogram labels severity: длительность resolution incidents MTTR
sla_uptime_percentage gauge: текущий uptime percentage
sla_met boolean gauge: 1 если SLA met 0 если breach

РИСКИ

uptime-kuma single point of failure: если uptime-kuma down мониторинг не работает. Решение: high availability deployment несколько instances, fallback на встроенные health checks промпта 7, external monitoring третьих лиц Pingdom как backup
SLA calculation accuracy: зависит от точности downtime tracking. Решение: автоматический downtime tracking через uptime-kuma heartbeats, manual override для false positives, audit trail для всех downtime records
Playbook obsolescence: playbooks устаревают при изменении архитектуры. Решение: quarterly review playbooks, version control playbooks в Git, feedback loop от operators что не работает
Status page delay: openstatus обновляется вручную или с задержкой. Решение: automated status updates через API при incident creation resolution, webhook integration uptime-kuma к openstatus

ROADMAP

Фаза 1: uptime-kuma и SLA calculation 1 неделя
Задачи: UptimeKumaClient createMonitor getMonitorStatus, SLAManager calculateUptime trackDowntime getMTTR, REST API uptime sla endpoints, юнит-тесты, интеграционные тесты uptime-kuma Docker
Критерии: monitors созданы для киосков, uptime calculation возвращает percentage, SLA reports генерируются

Фаза 2: Incident management и openstatus 1 неделя
Задачи: IncidentManager createIncident resolveIncident, OpenStatusClient updatePageStatus createIncident, интеграция с промптом 14 workflows auto-remediation, метрики incidents_created_total incident_resolution_duration_seconds
Критерии: incidents создаются и resolve, openstatus public page обновляется, workflows триггерятся на incidents

Фаза 3: Playbooks и admin UI 1 неделя
Задачи: OnCallPlaybooks getPlaybook listPlaybooks, playbook definitions device_disconnected payment_failure_rate, HealthCheckAggregator aggregated health, admin UI SLA dashboard incident management, E2E тесты full SLA flow playbook execution, документация
Критерии: playbooks доступны через API, operators используют playbooks для troubleshooting, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. UptimeKumaClient создаёт monitors для киосков и получает status uptime heartbeats
2. SLAManager вычисляет uptime percentage MTTR для periods и генерирует SLA reports
3. IncidentManager создаёт классифицирует resolve incidents с downtime tracking
4. OpenStatusClient обновляет public status page и публикует incidents
5. OnCallPlaybooks предоставляет playbooks для common issues с diagnosis resolution escalation steps
6. HealthCheckAggregator возвращает aggregated health всех сервисов OBD Thickness Payments Reports
7. REST API endpoints uptime sla incidents playbooks status-page health доступны
8. Метрики uptime_* incidents_* sla_* экспортируются в Prometheus
9. Интеграция с промптом 7 monitoring alerts триггерят incident creation
10. Интеграция с промптом 14 workflows auto-remediation на incidents
11. Интеграция с промптом 11 analytics downtime aggregation для SLA reports
12. Интеграция с промптом 12 admin-console SLA dashboard incident management UI
13. Юнит-тесты покрытие более 80%
14. Интеграционные тесты uptime-kuma openstatus sla-calculation проходят
15. E2E тесты full-sla-flow playbook-execution status-page-update проходят

ИТОГ

Промпт 15 завершает проект добавляя operational readiness через uptime-kuma мониторинг availability openstatus public status page SLA framework uptime target 99.5% MTTR target менее 2 часов incident management procedures on-call playbooks для operators. Интеграция с промптами 1-14 обеспечивает end-to-end operational excellence: health checks из всех сервисов агрегируются в /api/health/aggregated, downtime tracking автоматический через uptime-kuma heartbeats, alerts триггерят workflows auto-remediation промпта 14 для быстрого восстановления, SLA reports генерируются из DuckDB аналитики промпта 11, admin-console промпта 12 показывает SLA dashboard и incident management UI. Решение гарантирует качество услуг клиентам прозрачность статуса сервисов быстрое реагирование на инциденты соответствие SLA commitments.
