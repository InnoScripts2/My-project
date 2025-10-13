# Промпт 14 ИИ оркестрации задач

ЦЕЛЬ
Реализовать workflow automation через Activepieces low-code платформу для автоматизации операционных задач киосков trigger alert response auto-remediation scheduled maintenance data pipelines notification routing, workflow definitions YAML или UI builder для non-technical operators, connectors HTTP email SMS Slack Telegram Webhook для интеграции с внешними сервисами, workflow examples auto-restart на critical alert cleanup старых файлов sync orchestration daily reports, admin UI для workflow management создание редактирование мониторинг executions. Цель: снижение MTTR через автоматизацию реакции на инциденты, оптимизация операций через scheduled workflows, zero-code для operators без программирования.

КОНТЕКСТ
Промпты 1-13 генерируют события alerts device_disconnected payment_failed report_delivery_failed session_timeout и выполняют операции restart update sync cleanup. Операторы вручную реагируют на алерты: смотрят дашборд, определяют action, выполняют через admin-console restart или view logs. Это медленно MTTR высокий, ошибки human error, нагрузка на operators. Решение: workflow automation автоматические реакции на события и scheduled операции. Activepieces предоставляет low-code платформу: trigger types webhook schedule event, actions HTTP request send email SMS run script delay condition loop, visual flow builder drag-and-drop для создания workflows, execution history logs для audit, self-hosted deployment Docker или cloud SaaS. Интеграция: kiosk-agent отправляет события в Activepieces webhook trigger, workflow выполняет actions restart API call send notification, промпт 7 monitoring собирает метрики workflow_executions_total workflow_failures_total, промпт 12 admin-console embedded Activepieces UI для operators создавать workflows без coding.

ГРАНИЦЫ
Внутри: ActivepiecesClient API client для programmatic workflow trigger, WorkflowManager создание редактирование удаление workflows, WorkflowExecutor выполнение workflows локально или remote Activepieces server, trigger handlers webhook schedule event для запуска workflows, action executors HTTP email SMS script для выполнения actions, admin UI integration embedded Activepieces builder iframe или API-driven UI, REST API endpoints workflows executions triggers. Вне: сложные ETL data transformations делает промпт 11 DuckDB аналитика, ML model training inference не в scope только rule-based automation, custom code execution ограничена script actions Node.js или Python snippets. Интеграция: промпты 1-13 отправляют события через webhook или EventEmitter в WorkflowExecutor, промпт 7 monitoring метрики и alerts могут trigger workflows, промпт 8 security audit логирует workflow executions, промпт 12 admin-console показывает workflow management UI.

АРХИТЕКТУРА

МОДУЛЬ ActivepiecesClient
Файл apps/kiosk-agent/src/workflows/ActivepiecesClient.ts
Класс ActivepiecesClient методы:

- initClient apiUrl string apiKey string returns void
- createWorkflow workflow WorkflowDefinition returns Promise WorkflowResponse
- updateWorkflow workflowId string workflow WorkflowDefinition returns Promise WorkflowResponse
- deleteWorkflow workflowId string returns Promise void
- listWorkflows returns Promise array WorkflowResponse
- triggerWorkflow workflowId string payload object returns Promise ExecutionResponse
- getExecution executionId string returns Promise ExecutionResponse
- listExecutions workflowId string returns Promise array ExecutionResponse

WorkflowDefinition interface:

- name string уникальное имя например auto_restart_on_alert
- description string
- trigger object {type: webhook|schedule|event, config: object}
- steps array WorkflowStep последовательность actions
- enabled boolean true для активных workflows

WorkflowStep interface:

- name string
- type http|email|sms|script|condition|delay|loop
- config object параметры зависящие от type
- nextStep string optional имя следующего step или conditional branches

WorkflowResponse interface:

- workflowId string UUID
- name string
- enabled boolean
- createdAt string ISO8601
- updatedAt string ISO8601

ExecutionResponse interface:

- executionId string UUID
- workflowId string
- status running|completed|failed
- startedAt string ISO8601
- completedAt string optional ISO8601
- steps array {stepName: string, status: string, output: object}
- error string optional error message

Инициализация Activepieces:

- Self-hosted deployment: Docker контейнер `activepieces/activepieces:latest`, environment POSTGRES_URL для persistence, API_URL для kiosk-agent access
- Cloud SaaS: использовать Activepieces cloud apiUrl activepieces.com apiKey из dashboard

createWorkflow процесс:

```typescript
async createWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResponse> {
  const response = await axios.post(`${this.apiUrl}/api/workflows`, workflow, {
    headers: { 'Authorization': `Bearer ${this.apiKey}` }
  });
  return response.data;
}
```

triggerWorkflow процесс:

```typescript
async triggerWorkflow(workflowId: string, payload: object): Promise<ExecutionResponse> {
  const response = await axios.post(`${this.apiUrl}/api/workflows/${workflowId}/trigger`, payload, {
    headers: { 'Authorization': `Bearer ${this.apiKey}` }
  });
  return response.data;
}
```

МОДУЛЬ WorkflowManager
Файл apps/kiosk-agent/src/workflows/WorkflowManager.ts
Класс WorkflowManager методы:

- registerWorkflow workflow WorkflowDefinition returns Promise string workflowId
- updateWorkflow workflowId string workflow WorkflowDefinition returns Promise void
- removeWorkflow workflowId string returns Promise void
- getWorkflows returns Promise array WorkflowDefinition
- enableWorkflow workflowId string returns Promise void
- disableWorkflow workflowId string returns Promise void

Логика registerWorkflow:

```typescript
async registerWorkflow(workflow: WorkflowDefinition): Promise<string> {
  const response = await this.activepiecesClient.createWorkflow(workflow);

  // Store workflowId in local registry
  this.workflowRegistry.set(workflow.name, response.workflowId);

  return response.workflowId;
}
```

Workflow registry: локальное хранилище Map или БД таблица workflows для маппинга name к workflowId

МОДУЛЬ WorkflowExecutor
Файл apps/kiosk-agent/src/workflows/WorkflowExecutor.ts
Класс WorkflowExecutor методы:

- executeWorkflow workflowId string payload object returns Promise ExecutionResponse
- getExecutionStatus executionId string returns Promise ExecutionResponse
- cancelExecution executionId string returns Promise void

Логика executeWorkflow:

```typescript
async executeWorkflow(workflowId: string, payload: object): Promise<ExecutionResponse> {
  const execution = await this.activepiecesClient.triggerWorkflow(workflowId, payload);

  // Emit metric
  this.metricsService.incrementCounter('workflow_executions_total', { workflowId });

  // Wait for completion or timeout
  const finalStatus = await this.pollExecution(execution.executionId, 60000);

  if (finalStatus.status === 'failed') {
    this.metricsService.incrementCounter('workflow_failures_total', { workflowId });
  }

  return finalStatus;
}
```

pollExecution процесс: периодический запрос getExecution каждые 2s до status completed или failed или timeout 60s

МОДУЛЬ WorkflowTriggerHandler
Файл apps/kiosk-agent/src/workflows/WorkflowTriggerHandler.ts
Класс WorkflowTriggerHandler методы:

- registerWebhookTrigger workflowId string webhookPath string returns void
- registerScheduleTrigger workflowId string cronExpression string returns void
- registerEventTrigger workflowId string eventName string returns void
- handleWebhookRequest req Request res Response returns Promise void

Логика registerWebhookTrigger:

```typescript
registerWebhookTrigger(workflowId: string, webhookPath: string): void {
  this.expressApp.post(webhookPath, async (req, res) => {
    await this.workflowExecutor.executeWorkflow(workflowId, req.body);
    res.status(200).json({ message: 'Workflow triggered' });
  });
}
```

Логика registerScheduleTrigger:

```typescript
registerScheduleTrigger(workflowId: string, cronExpression: string): void {
  cron.schedule(cronExpression, async () => {
    await this.workflowExecutor.executeWorkflow(workflowId, {});
  });
}
```

Логика registerEventTrigger:

```typescript
registerEventTrigger(workflowId: string, eventName: string): void {
  this.eventEmitter.on(eventName, async (payload) => {
    await this.workflowExecutor.executeWorkflow(workflowId, payload);
  });
}
```

ГОТОВЫЕ WORKFLOWS

Workflow 1: Auto-restart on critical alert
Trigger: event alert_triggered условие severity critical
Steps:

1. Condition: проверить alertName === device_disconnected или agent_down
2. HTTP request: POST /api/kiosks/:kioskId/restart
3. Delay: 30 секунд ожидание restart completion
4. HTTP request: GET /api/health проверка kiosk восстановлен
5. Email: отправить notification operator result success или failed

Определение YAML:

```yaml
name: auto_restart_on_critical_alert
description: Automatically restart kiosk on critical device or agent alert
trigger:
  type: event
  config:
    eventName: alert_triggered
    condition: payload.severity === 'critical'
steps:
  - name: check_alert_type
    type: condition
    config:
      condition: payload.alertName === 'device_disconnected' || payload.alertName === 'agent_down'
      onTrue: restart_kiosk
      onFalse: end
  - name: restart_kiosk
    type: http
    config:
      method: POST
      url: http://localhost:8080/api/kiosks/{{payload.kioskId}}/restart
      headers:
        Authorization: Bearer {{env.ADMIN_TOKEN}}
  - name: wait_restart
    type: delay
    config:
      seconds: 30
  - name: check_health
    type: http
    config:
      method: GET
      url: http://localhost:8080/api/health
  - name: notify_operator
    type: email
    config:
      to: operator@example.com
      subject: Kiosk {{payload.kioskId}} restart completed
      body: Health check result {{steps.check_health.output.status}}
```

Workflow 2: Daily cleanup старых файлов
Trigger: schedule cron 0 3 * * * ежедневно 3 AM
Steps:

1. Script: выполнить Node.js скрипт для поиска файлов старше 7 дней в exports/ и logs/
2. HTTP request: DELETE /api/reports/cleanup query param olderThan 7
3. Email: отправить summary deleted files count size

Определение YAML:

```yaml
name: daily_cleanup
description: Cleanup old files older than 7 days
trigger:
  type: schedule
  config:
    cronExpression: 0 3 * * *
steps:
  - name: find_old_files
    type: script
    config:
      language: nodejs
      code: |
        const fs = require('fs');
        const path = require('path');
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        const dirs = ['exports/', 'logs/'];
        let deletedCount = 0;
        dirs.forEach(dir => {
          const files = fs.readdirSync(dir);
          files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtime.getTime() > maxAge) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          });
        });
        return { deletedCount };
  - name: cleanup_reports
    type: http
    config:
      method: DELETE
      url: http://localhost:8080/api/reports/cleanup?olderThan=7
  - name: notify_summary
    type: email
    config:
      to: admin@example.com
      subject: Daily cleanup completed
      body: Deleted {{steps.find_old_files.output.deletedCount}} files
```

Workflow 3: Sync orchestration для Seafile
Trigger: schedule cron 0 4 * * * ежедневно 4 AM
Steps:

1. HTTP request: POST /api/reports/sync запуск manual sync
2. Loop: poll GET /api/reports/sync/:syncId каждые 10s до status completed
3. Condition: если sync success отправить email success иначе Slack notification failure с retry

Определение YAML:

```yaml
name: sync_orchestration
description: Orchestrate daily Seafile sync
trigger:
  type: schedule
  config:
    cronExpression: 0 4 * * *
steps:
  - name: start_sync
    type: http
    config:
      method: POST
      url: http://localhost:8080/api/reports/sync
  - name: poll_sync_status
    type: loop
    config:
      maxIterations: 30
      delaySeconds: 10
      condition: steps.check_sync.output.status !== 'completed'
      steps:
        - name: check_sync
          type: http
          config:
            method: GET
            url: http://localhost:8080/api/reports/sync/{{steps.start_sync.output.syncId}}
  - name: check_result
    type: condition
    config:
      condition: steps.check_sync.output.status === 'completed'
      onTrue: notify_success
      onFalse: notify_failure
  - name: notify_success
    type: email
    config:
      to: admin@example.com
      subject: Seafile sync completed
      body: Synced {{steps.check_sync.output.filesSynced}} files
  - name: notify_failure
    type: slack
    config:
      webhookUrl: https://hooks.slack.com/services/YOUR_WEBHOOK
      message: Seafile sync failed. Please check logs.
```

МОДУЛЬ AdminWorkflowUI
Файл apps/kiosk-admin/src/views/WorkflowsView.vue
Компонент управление workflows:

- Список workflows таблица Name Description Enabled Executions Actions
- Кнопка Create Workflow открывает модал или embedded Activepieces builder
- Actions: Edit Delete Enable Disable View Executions
- Фильтры: enabled true false, search по name

Логика createWorkflow:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useWorkflowsStore } from '@/stores/workflows';

const workflowsStore = useWorkflowsStore();
const showCreateModal = ref(false);

async function onCreateWorkflow(workflow: WorkflowDefinition) {
  await workflowsStore.createWorkflow(workflow);
  showCreateModal.value = false;
}
</script>

<template>
  <div class="workflows-view">
    <a-button type="primary" @click="showCreateModal = true">Create Workflow</a-button>

    <a-table :dataSource="workflowsStore.workflows" :columns="columns">
      <template #actions="{ record }">
        <a-button @click="onEditWorkflow(record.workflowId)">Edit</a-button>
        <a-button @click="onDeleteWorkflow(record.workflowId)">Delete</a-button>
      </template>
    </a-table>

    <a-modal v-model:open="showCreateModal" title="Create Workflow">
      <WorkflowBuilderForm @submit="onCreateWorkflow" />
    </a-modal>
  </div>
</template>
```

WorkflowBuilderForm: форма для ввода name description trigger steps или embedded iframe Activepieces visual builder

REST API

GET /api/workflows
Получить список workflows
Ответ: 200 OK application/json

```json
[
  {"workflowId": "wf-001", "name": "auto_restart_on_critical_alert", "enabled": true, "createdAt": "2025-01-15T12:00:00Z"}
]
```

POST /api/workflows
Создать workflow
Запрос: application/json WorkflowDefinition
Ответ: 201 Created application/json WorkflowResponse

PUT /api/workflows/:id
Обновить workflow
Запрос: application/json WorkflowDefinition
Ответ: 200 OK

DELETE /api/workflows/:id
Удалить workflow
Ответ: 204 No Content

POST /api/workflows/:id/trigger
Trigger workflow вручную
Запрос: application/json {payload: object}
Ответ: 200 OK application/json ExecutionResponse

GET /api/workflows/:id/executions
Получить executions для workflow
Ответ: 200 OK application/json

```json
[
  {"executionId": "ex-001", "workflowId": "wf-001", "status": "completed", "startedAt": "2025-01-15T12:00:00Z", "completedAt": "2025-01-15T12:01:00Z"}
]
```

GET /api/executions/:id
Получить execution детали
Ответ: 200 OK application/json ExecutionResponse с steps details

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/workflows/tests/

- ActivepiecesClient.test.ts: createWorkflow вызывает API и возвращает WorkflowResponse, triggerWorkflow отправляет payload и возвращает ExecutionResponse
- WorkflowManager.test.ts: registerWorkflow сохраняет workflowId в registry, enableWorkflow обновляет статус enabled true
- WorkflowExecutor.test.ts: executeWorkflow вызывает triggerWorkflow и инкрементирует метрику workflow_executions_total, pollExecution ждет completion или timeout

Интеграционные тесты apps/kiosk-agent/src/workflows/tests/integration/

- activepieces-integration.test.ts: Docker контейнер Activepieces запущен, createWorkflow создает workflow в Activepieces, triggerWorkflow выполняет и возвращает completed status, listExecutions возвращает execution history
- workflow-triggers.test.ts: registerWebhookTrigger создает endpoint POST /webhooks/workflow-001, HTTP request на endpoint триггерит workflow, registerScheduleTrigger cron срабатывает и триггерит workflow

E2E тесты apps/kiosk-agent/src/workflows/tests/e2e/

- auto-restart-workflow.test.ts: создание workflow auto_restart_on_critical_alert, trigger event alert_triggered с severity critical, workflow выполняет restart API call, проверка kiosk restarted, email notification отправлен
- daily-cleanup-workflow.test.ts: создание workflow daily_cleanup с schedule trigger, ожидание cron срабатывания или manual trigger, проверка старые файлы удалены, email summary отправлен
- sync-orchestration-workflow.test.ts: создание workflow sync_orchestration, manual trigger, workflow запускает sync poll status до completion, проверка sync completed, notification отправлена

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/workflows/README.md
Секции:

- Обзор: workflow automation через Activepieces, triggers webhook schedule event, actions HTTP email SMS script
- Activepieces Setup: Docker deployment activepieces/activepieces:latest, environment POSTGRES_URL API_URL, API key generation
- Workflow Definitions: YAML формат name trigger steps, trigger types webhook schedule event, step types http email sms script condition delay loop
- Built-in Workflows: auto_restart_on_critical_alert daily_cleanup sync_orchestration, описание каждого workflow trigger steps
- Creating Workflows: через admin UI WorkflowsView или programmatic API POST /api/workflows, WorkflowDefinition interface
- Execution Monitoring: GET /api/workflows/:id/executions, ExecutionResponse с steps details, metrics workflow_executions_total workflow_failures_total
- Integration: промпты 1-13 события триггерят workflows, промпт 7 monitoring метрики, промпт 12 admin-console workflow management UI
- Troubleshooting: Activepieces connection failed проверить Docker контейнер running, workflow execution timeout увеличить pollExecution timeout, step failure проверить logs steps[].output, webhook не триггерится проверить endpoint registered

ПРИМЕРЫ

Пример инициализация ActivepiecesClient

```typescript
// apps/kiosk-agent/src/workflows/activepieces-init.ts
import { ActivepiecesClient } from './ActivepiecesClient.js';

const activepiecesClient = new ActivepiecesClient();
activepiecesClient.initClient('http://localhost:3000', process.env.ACTIVEPIECES_API_KEY);

const workflows = await activepiecesClient.listWorkflows();
console.log('Workflows:', workflows);
```

Пример создание workflow programmatically

```typescript
// apps/kiosk-agent/src/workflows/create-workflow-example.ts
import { WorkflowManager } from './WorkflowManager.js';

const workflowManager = new WorkflowManager();

const workflow: WorkflowDefinition = {
  name: 'test_workflow',
  description: 'Test workflow',
  trigger: { type: 'webhook', config: { webhookPath: '/webhooks/test' } },
  steps: [
    { name: 'send_email', type: 'email', config: { to: 'admin@example.com', subject: 'Test', body: 'Test body' } }
  ],
  enabled: true
};

const workflowId = await workflowManager.registerWorkflow(workflow);
console.log('Workflow created:', workflowId);
```

Пример trigger workflow

```typescript
// apps/kiosk-agent/src/workflows/trigger-workflow-example.ts
import { WorkflowExecutor } from './WorkflowExecutor.js';

const workflowExecutor = new WorkflowExecutor();

const execution = await workflowExecutor.executeWorkflow('wf-001', { kioskId: 'kiosk-001', alertName: 'device_disconnected' });

console.log('Execution status:', execution.status);
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
ACTIVEPIECES_API_URL=http://localhost:3000
ACTIVEPIECES_API_KEY=ap_key_xxxxxxxx
WORKFLOWS_ENABLED=true
WORKFLOW_EXECUTION_TIMEOUT=60000
```

Activepieces Docker deployment:

```bash
docker run -d \
  -p 3000:3000 \
  -e POSTGRES_URL=postgresql://user:pass@localhost:5432/activepieces \
  -e API_URL=http://localhost:3000 \
  activepieces/activepieces:latest
```

БЕЗОПАСНОСТЬ

Workflow execution permissions: workflows могут вызывать любые API endpoints с admin permissions. Решение: scope workflows к определенным endpoints, require approval для destructive actions DELETE PUT, audit log всех executions
API key security: ACTIVEPIECES_API_KEY хранится в ENV экспонирован. Решение: rotate keys периодически, использовать encrypted storage или secrets manager
Webhook endpoints: webhook triggers доступны публично без auth. Решение: require signature verification HMAC или Bearer token, firewall allow только internal IPs
Script injection: step type script может выполнять произвольный код. Решение: sandboxed execution VM или Docker container, resource limits CPU memory timeout, disable script steps для operators allow только admins

МЕТРИКИ

workflow_executions_total counter labels workflowId status completed|failed: количество выполненных workflows
workflow_execution_duration_seconds histogram labels workflowId: длительность executions
workflow_steps_executed_total counter labels workflowId stepName status: количество выполненных steps
workflow_triggers_total counter labels triggerType webhook|schedule|event: количество срабатываний triggers
workflow_failures_total counter labels workflowId errorType: количество failed executions

РИСКИ

Workflow execution timeout: сложные workflows с loops могут превышать timeout 60s. Решение: увеличить WORKFLOW_EXECUTION_TIMEOUT, оптимизировать steps убрать лишние delays, async execution без polling
Activepieces single point of failure: если Activepieces down workflows не выполняются. Решение: high availability deployment несколько instances, fallback на local execution без Activepieces для критичных workflows
Workflow misconfiguration: неправильный trigger или step config приводит к failures. Решение: validation schema для WorkflowDefinition, test mode для новых workflows перед enable, rollback mechanism revert к предыдущей версии
Notification spam: workflow отправляет email каждую минуту на schedule trigger. Решение: rate limiting для notification actions, aggregation notifications batch отправка раз в час

ROADMAP

Фаза 1: ActivepiecesClient и workflow management 1 неделя
Задачи: ActivepiecesClient createWorkflow triggerWorkflow listExecutions, WorkflowManager registerWorkflow enableWorkflow, REST API workflows endpoints, юнит-тесты, интеграционные тесты Activepieces API
Критерии: workflows создаются и триггерятся, executions возвращают status, API endpoints работают

Фаза 2: Trigger handlers и built-in workflows 1 неделя
Задачи: WorkflowTriggerHandler webhook schedule event triggers, built-in workflows auto_restart daily_cleanup sync_orchestration, интеграция с промптами 1-13 events, метрики workflow_executions_total
Критерии: triggers срабатывают на events webhooks schedules, built-in workflows выполняются и проходят E2E тесты

Фаза 3: Admin UI и execution monitoring 1 неделя
Задачи: AdminWorkflowUI WorkflowsView создание редактирование workflows, execution monitoring GET /api/workflows/:id/executions, интеграция с промптом 12 admin-console, E2E тесты workflow management, документация
Критерии: operators создают workflows через UI, execution history доступна, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. ActivepiecesClient интегрируется с Activepieces API для createWorkflow triggerWorkflow listExecutions
2. WorkflowManager регистрирует workflows и управляет enabled disabled статусами
3. WorkflowExecutor выполняет workflows и poll status до completion или timeout
4. WorkflowTriggerHandler регистрирует webhook schedule event triggers
5. Built-in workflows auto_restart_on_critical_alert daily_cleanup sync_orchestration реализованы и работают
6. REST API endpoints workflows create update delete trigger executions доступны
7. AdminWorkflowUI в промпте 12 admin-console позволяет создавать редактировать workflows
8. Метрики workflow_* экспортируются в Prometheus
9. Интеграция с промптами 1-13 events триггерят workflows
10. Юнит-тесты покрытие >80%
11. Интеграционные тесты activepieces-integration workflow-triggers проходят
12. E2E тесты auto-restart-workflow daily-cleanup-workflow sync-orchestration-workflow проходят

ИТОГ

Промпт 14 добавляет workflow automation через Activepieces для автоматизации операционных задач киосков trigger alert response auto-remediation scheduled maintenance. Built-in workflows auto_restart_on_critical_alert daily_cleanup sync_orchestration покрывают типовые сценарии, WorkflowManager и AdminWorkflowUI позволяют operators создавать custom workflows без programming. Интеграция с промптами 1-13 events обеспечивает автоматические реакции на алерты device_disconnected payment_failed, снижение MTTR и оптимизация операций. Metrics workflow_executions_total в промпте 7 monitoring обеспечивают visibility executions, промпт 12 admin-console embedded UI для workflow management.
