# Workflow Automation

Автоматизация операционных задач киосков через Activepieces low-code платформу.

## Обзор

Workflow automation обеспечивает:
- Автоматические реакции на события и алерты (trigger alert response)
- Авто-исправление проблем (auto-remediation)
- Запланированное обслуживание (scheduled maintenance)
- Маршрутизацию уведомлений (notification routing)
- Zero-code управление workflows для операторов

## Архитектура

Модули:
- `ActivepiecesClient` - API клиент для Activepieces
- `WorkflowManager` - управление жизненным циклом workflows
- `WorkflowExecutor` - выполнение workflows и мониторинг
- `WorkflowTriggerHandler` - обработка триггеров (webhook/schedule/event)

## Activepieces Setup

### Self-hosted Deployment

```bash
docker run -d \
  -p 3000:3000 \
  -e POSTGRES_URL=postgresql://user:pass@localhost:5432/activepieces \
  -e API_URL=http://localhost:3000 \
  activepieces/activepieces:latest
```

### Environment Variables

```env
ACTIVEPIECES_API_URL=http://localhost:3000
ACTIVEPIECES_API_KEY=ap_key_xxxxxxxx
WORKFLOWS_ENABLED=true
WORKFLOW_EXECUTION_TIMEOUT=60000
```

Генерация API key:
1. Открыть Activepieces UI: http://localhost:3000
2. Settings → API Keys → Generate New Key
3. Скопировать ключ в `.env`

## Workflow Definitions

Формат YAML:

```yaml
name: workflow_name
description: Workflow description
trigger:
  type: webhook|schedule|event
  config:
    # Зависит от типа триггера
steps:
  - name: step_name
    type: http|email|sms|script|condition|delay|loop
    config:
      # Зависит от типа шага
```

### Trigger Types

**Webhook**
```yaml
trigger:
  type: webhook
  config:
    webhookPath: /webhooks/my-workflow
    method: POST
```

**Schedule**
```yaml
trigger:
  type: schedule
  config:
    cronExpression: "0 3 * * *"  # Ежедневно в 3 AM
```

**Event**
```yaml
trigger:
  type: event
  config:
    eventName: alert_triggered
    condition: payload.severity === 'critical'
```

### Step Types

**HTTP Request**
```yaml
- name: call_api
  type: http
  config:
    method: POST
    url: http://localhost:8080/api/endpoint
    headers:
      Authorization: Bearer {{env.TOKEN}}
    body:
      key: value
```

**Email**
```yaml
- name: send_email
  type: email
  config:
    to: admin@example.com
    subject: Alert notification
    body: Alert details {{payload.alertName}}
```

**Script**
```yaml
- name: run_script
  type: script
  config:
    language: nodejs
    code: |
      const result = { message: 'Script executed' };
      return result;
```

**Condition**
```yaml
- name: check_condition
  type: condition
  config:
    condition: payload.status === 'success'
  onTrue: success_step
  onFalse: failure_step
```

**Delay**
```yaml
- name: wait
  type: delay
  config:
    seconds: 30
```

## Built-in Workflows

### Auto-restart on Critical Alert

Автоматический перезапуск киоска при критических алертах.

Триггер: event `alert_triggered` с `severity: critical`

Шаги:
1. Проверка типа алерта (device_disconnected или agent_down)
2. Перезапуск киоска через API
3. Ожидание 30 секунд
4. Проверка health status
5. Отправка email уведомления оператору

### Daily Cleanup

Ежедневная очистка старых файлов.

Триггер: schedule `0 3 * * *` (3 AM)

Шаги:
1. Поиск и удаление файлов старше 7 дней
2. Очистка отчётов через API
3. Отправка email с summary

### Sync Orchestration

Оркестрация ежедневной синхронизации Seafile.

Триггер: schedule `0 4 * * *` (4 AM)

Шаги:
1. Запуск синхронизации
2. Polling статуса (максимум 30 итераций по 10 секунд)
3. Проверка результата
4. Отправка уведомления (email при успехе, Slack при ошибке)

## Creating Workflows

### Programmatic API

```typescript
import { WorkflowManager } from './WorkflowManager.js';
import type { WorkflowDefinition } from './types.js';

const workflowManager = new WorkflowManager();

const workflow: WorkflowDefinition = {
  name: 'my_workflow',
  description: 'My custom workflow',
  trigger: { 
    type: 'webhook', 
    config: { webhookPath: '/webhooks/my-workflow' } 
  },
  steps: [
    {
      name: 'send_notification',
      type: 'email',
      config: {
        to: 'admin@example.com',
        subject: 'Workflow triggered',
        body: 'Workflow executed successfully',
      },
    },
  ],
  enabled: true,
};

const workflowId = await workflowManager.registerWorkflow(workflow);
```

### REST API

**Create Workflow**
```http
POST /api/workflows
Content-Type: application/json

{
  "name": "my_workflow",
  "description": "Description",
  "trigger": {...},
  "steps": [...],
  "enabled": true
}
```

**List Workflows**
```http
GET /api/workflows
```

**Trigger Workflow**
```http
POST /api/workflows/:id/trigger
Content-Type: application/json

{
  "payload": {
    "key": "value"
  }
}
```

**Get Executions**
```http
GET /api/workflows/:id/executions
```

**Get Execution Details**
```http
GET /api/executions/:id
```

## Execution Monitoring

Метрики Prometheus:
- `workflow_executions_total{workflowId, status}` - количество выполнений
- `workflow_execution_duration_seconds{workflowId}` - длительность выполнений
- `workflow_steps_executed_total{workflowId, stepName, status}` - выполненные шаги
- `workflow_triggers_total{triggerType}` - активации триггеров
- `workflow_failures_total{workflowId, errorType}` - количество ошибок

Просмотр метрик:
```http
GET /metrics
```

## Integration

### С промптами 1-13 (События)

События отправляются через EventEmitter:

```typescript
import { eventEmitter } from './events.js';

// Отправка события алерта
eventEmitter.emit('alert_triggered', {
  severity: 'critical',
  alertName: 'device_disconnected',
  kioskId: 'kiosk-001',
});
```

### С промптом 7 (Monitoring)

Метрики workflows экспортируются в общий Prometheus registry:

```typescript
import { getWorkflowMetrics } from './workflows/metrics.js';
import { Registry } from 'prom-client';

const registry = new Registry();
const workflowMetrics = getWorkflowMetrics(registry);
```

### С промптом 12 (Admin Console)

Admin UI предоставляет интерфейс для управления workflows через REST API.

## Troubleshooting

**Activepieces connection failed**
- Проверить Docker контейнер: `docker ps | grep activepieces`
- Проверить переменные окружения ACTIVEPIECES_API_URL и ACTIVEPIECES_API_KEY
- Проверить доступность API: `curl http://localhost:3000/api/health`

**Workflow execution timeout**
- Увеличить WORKFLOW_EXECUTION_TIMEOUT в `.env`
- Оптимизировать шаги workflow (убрать лишние delays)
- Использовать async execution для длительных операций

**Step failure**
- Проверить логи выполнения: `GET /api/executions/:id`
- Проверить `steps[].output` для деталей ошибки
- Проверить доступность внешних API/сервисов

**Webhook не триггерится**
- Проверить endpoint зарегистрирован: `GET /api/workflows`
- Проверить HTTP метод (POST по умолчанию)
- Проверить формат payload

## Security

- API key хранится в ENV (использовать encrypted storage или secrets manager)
- Webhook endpoints требуют signature verification (HMAC)
- Script execution в sandboxed environment (VM или Docker container)
- Workflow permissions ограничены определёнными endpoints
- Audit log всех executions

## Development

Запуск тестов:
```bash
npm test
```

Локальная разработка:
```bash
# Запустить Activepieces
docker-compose up -d activepieces

# Запустить агента
npm run dev
```

## Examples

См. `examples/built-in-workflows.ts` для примеров готовых workflows.
