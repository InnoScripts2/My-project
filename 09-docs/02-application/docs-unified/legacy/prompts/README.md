# OBD-II Implementation Prompts

Серия из 4 implementation промптов для поэтапной разработки OBD-II диагностической системы киоска самообслуживания.

## Структура промптов

### Session 1: Core OBD Foundation (514 строк)
**Файл:** `session-01-obd-core-foundation.txt`

**Цель:** Базовая инфраструктура OBD-II системы

**Реализует:**
- PID Database (50+ PIDs из node-bluetooth-obd)
- BluetoothObdDriver (ELM327 Serial Port протокол)
- Elm327Parser и DtcParser
- PollingManager (event-driven периодические запросы)
- ObdManagerAdapter (фасад для всех компонентов)

**Источники:** node-bluetooth-obd-master (Apache 2.0)

**Оценка:** 28 часов, 15 задач

---

### Session 3: UI Integration (433 строки)
**Файл:** `session-03-obd-ui-integration.txt`

**Цель:** Frontend-backend интеграция и real-time визуализация

**Реализует:**
- REST API (6 endpoints: status, connect, disconnect, dtc, clear, pids)
- WebSocket streaming (ws://localhost:3000/api/obd/stream, 10 msg/s throttle)
- Canvas-based UI компоненты (RPM/Speed gauges, Temperature bars, Charts)
- Diagnostic screens (connection.html, scanning.html, results.html)
- Touch-optimized interface (1920x1080 kiosk, кнопки ≥80x80px)

**Источники:** EQM_OBDWEB-main (UI patterns only)

**Оценка:** 20 часов, 16 задач

---

### Session 4: Payments & Reports (470 строк)
**Файл:** `session-04-obd-integration-reports.txt`

**Цель:** Интеграция платежей и генерация профессиональных отчётов

**Реализует:**
- Payment integration (480 RUB через существующий payments модуль)
- SessionManager (lifecycle: create → scan → pay → report → cleanup)
- PaymentAdapter (wraps payments, DEV auto-confirm через 2s)
- ReportGenerator (PDF generation: puppeteer/pdfkit)
- HTML templates (report-standard.html, report-hybrid.html для Toyota/Lexus)
- PDF styles (A4, color-coded DTC types)
- Paywall UI flow (preview blur → payment → unlock → report)
- RecommendationsEngine (DTC analysis → user-friendly advice)
- CleanupTask (scheduled 24h cleanup)

**Интеграции:** payments module, reports module (config-only extensions)

**Оценка:** 22 часа, 16 задач

---

### Session 5: System Integration & Production (495 строк)
**Файл:** `session-05-obd-system-integration.txt`

**Цель:** Финальная интеграция, мониторинг, production готовность

**Реализует:**
- ObdWorkflowOrchestrator (E2E workflow: 7 methods)
- SessionStateMachine (15 states, validated transitions)
- ErrorRecoveryHandler (4 error types: connection, scan, payment, report)
- ObdLocksAdapter (unlock/wait/lock адаптера, timeouts)
- ObdMonitoringCollector (10 Prometheus metrics)
- Alerts integration (5 alerts: adapter unavailable, failures, conversions)
- ObdConfig (ENV loading, Zod validation)
- Health check endpoints (/health, /ready, /live)
- E2E tests (full cycle + 4 error scenarios)
- Frontend utils (troubleshooting.html, loading.html, error-handler.js, retry-logic.js)
- Technical docs (architecture.md, troubleshooting.md, metrics.md)
- Testing checklist (pre-deployment, functional, errors, performance, security, monitoring, UX)
- Production config (.env.prod, deployment guide)

**Оценка:** 26 часов, 16 задач

---

## Общая статистика

**Промптов:** 4
**Строк спецификаций:** ~1,912
**Задач:** 63
**Оценка времени:** 96 часов (~2.5 недели full-time или ~3 месяца part-time)

## Архитектура (итоговая)

```
apps/kiosk-agent/src/
├── devices/obd/                    (Session 1)
│   ├── drivers/                    BluetoothObdDriver
│   ├── database/                   PidDatabase
│   ├── polling/                    PollingManager
│   ├── commands/                   Elm327Commands
│   ├── parsers/                    Elm327Parser, DtcParser
│   ├── events/                     ObdEvents, types
│   └── adapters/                   ObdManagerAdapter
├── api/                            (Session 3, 5)
│   ├── routes/                     obd.routes.ts, obd-payment.routes.ts, obd-report.routes.ts, obd-health.routes.ts
│   └── websocket/                  obd.websocket.ts
├── integrations/obd/               (Session 4, 5)
│   ├── session-manager.ts
│   ├── payment-adapter.ts
│   ├── report-generator.ts
│   ├── recommendations.ts
│   ├── cleanup-task.ts
│   ├── locks-adapter.ts
│   ├── monitoring-collector.ts
│   └── alerts.integration.ts
├── orchestration/                  (Session 5)
│   ├── obd-workflow.orchestrator.ts
│   ├── session-state.machine.ts
│   └── error-recovery.handler.ts
├── config/                         (Session 5)
│   └── obd.config.ts
├── templates/obd/                  (Session 4)
│   ├── report-standard.html
│   ├── report-hybrid.html
│   └── report-styles.css
└── tests/                          (Sessions 1-5)
    ├── unit/
    └── e2e/                        obd-full-flow.test.ts

apps/kiosk-frontend/src/
├── screens/diagnostics/            (Sessions 3, 4, 5)
│   ├── connection.html
│   ├── scanning.html
│   ├── results.html
│   ├── paywall.html
│   ├── report-preview.html
│   ├── troubleshooting.html
│   └── loading.html
├── components/obd/                 (Session 3)
│   ├── gauges.js
│   ├── charts.js
│   ├── dtc-list.js
│   ├── connection-status.js
│   └── hybrid-panel.js
├── styles/obd/                     (Session 3)
│   ├── diagnostics.css
│   ├── gauges.css
│   └── charts.css
├── api/                            (Sessions 3, 4)
│   ├── obd-client.js
│   ├── obd-websocket.js
│   └── obd-payment-client.js
└── utils/                          (Session 5)
    ├── error-handler.js
    └── retry-logic.js
```

## Последовательность реализации

1. **Session 1** → Базовая инфраструктура, драйверы, парсеры
2. **Session 3** → UI интеграция, WebSocket, визуализация
3. **Session 4** → Платежи, PDF отчёты, email/SMS доставка
4. **Session 5** → Orchestration, error handling, мониторинг, production готовность

## Ключевые особенности

- **Модульность:** Каждая сессия независима, чёткие границы между компонентами
- **Тестируемость:** Unit тесты для логики, E2E тесты для workflow
- **Мониторинг:** Prometheus метрики, alerts, health checks
- **Error recovery:** Graceful degradation, retry логика, user-friendly messages
- **Production-ready:** ENV конфигурация, deployment guide, operational docs
- **DEV mode:** FakeObdDevice, skip payment, mock scenarios

## Технологии

**Backend:** Node.js, TypeScript, ESM, Express, WebSocket
**Frontend:** Vanilla JS, Canvas API, ES modules
**Testing:** Node Test Runner, Playwright
**Monitoring:** Prometheus, Sentry
**PDF:** Puppeteer/pdfkit
**Validation:** Zod schemas

## Лицензии источников

- `node-bluetooth-obd-master`: Apache 2.0
- Все созданные компоненты: собственная разработка

## Статус

Все 4 промпта завершены и готовы к последовательной реализации.
