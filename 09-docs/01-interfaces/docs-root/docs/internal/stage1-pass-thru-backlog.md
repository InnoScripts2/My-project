# Stage 1 Backlog — PassThruClient и киоск-агент

## 1. JNI Layer

### Task: Setup C++ JNI project skeleton
- **Description**: Создать `packages/pass-thru-jni` с CMakeLists, Gradle-модулем и базовой JNI-структурой (`PassThruBridge`).
- **Owner**: C++ Developer
- **Due**: 2025-10-27
- **Tags**: stage1, jni, setup

### Task: Implement PassThruOpen/Close bindings
- **Description**: Реализовать функции `passThruOpen`, `passThruClose` с управлением дескрипторами и обработкой ошибок.
- **Owner**: C++ Developer
- **Due**: 2025-10-29
- **Tags**: stage1, jni, pass-thru

### Task: Implement PassThruConnect/Disconnect bindings
- **Description**: Поддержать протоколы ISO9141, ISO15765, ISOPWM; добавить маппинг параметров.
- **Owner**: C++ Developer
- **Due**: 2025-11-01
- **Tags**: stage1, jni, pass-thru

### Task: Implement Read/Write Msgs
- **Description**: Встроить буферизацию сообщений, обработку таймаутов и JNI-обмен массивами.
- **Owner**: C++ Developer
- **Due**: 2025-11-05
- **Tags**: stage1, jni, messaging

### Task: Implement Ioctl operations
- **Description**: Поддержать `SET_CONFIG`, `READ_VBATT`, `SET_PROGRAMMING_VOLTAGE`, `FAST_INIT`.
- **Owner**: C++ Developer
- **Due**: 2025-11-07
- **Tags**: stage1, jni, ioctl

### Task: JNI Unit Tests (loopback)
- **Description**: Настроить GoogleTest, реализовать loopback-драйвер, проверить открытие/чтение/запись.
- **Owner**: QA + C++
- **Due**: 2025-11-08
- **Tags**: stage1, testing

## 2. Kotlin PassThruClient

### Task: Kotlin interface & error model
- **Description**: Реализовать интерфейсы `PassThruClient`, `PassThruSession`, классы ошибок из `docs/tech/pass-thru-client-spec.md`.
- **Owner**: Kotlin Developer
- **Due**: 2025-11-03
- **Tags**: stage1, kotlin

### Task: JNI binding integration
- **Description**: Подключить `pass-thru-jni` через Gradle, реализовать маппинг ошибок и конвертацию структур.
- **Owner**: Kotlin Developer
- **Due**: 2025-11-05
- **Tags**: stage1, kotlin, jni

### Task: Session lifecycle management
- **Description**: Управление каналами, автоматическое переподключение, таймауты.
- **Owner**: Kotlin Developer
- **Due**: 2025-11-07
- **Tags**: stage1, kotlin

### Task: Diagnostic flows (DTC read/clear, PID read)
- **Description**: Сценарии поверх PassThruClient, логирование запросов/ответов.
- **Owner**: Kotlin Developer
- **Due**: 2025-11-12
- **Tags**: stage1, diagnostics

## 3. Kiosk Agent Integration

### Task: Node adapter for PassThruClient
- **Description**: Создать модуль `apps/kiosk-agent/src/devices/passThruClient.ts`, реализовать HTTP API.
- **Owner**: Node Developer
- **Due**: 2025-11-10
- **Tags**: stage1, agent

### Task: DTC package importer to SQLite
- **Description**: Реализовать `apps/kiosk-agent/src/dtc/importer.ts`, импорт `.obdresource` в SQLite базу.
- **Owner**: Node Developer
- **Due**: 2025-11-05
- **Tags**: stage1, data

### Task: Agent logging pipeline
- **Description**: Настроить логирование операций диагностики и импорта в формате JSONL, интеграция с мониторингом.
- **Owner**: Node Developer
- **Due**: 2025-11-12
- **Tags**: stage1, logging

### Task: Dev simulator
- **Description**: Реализовать mock PassThruClient для DEV окружения без адаптера.
- **Owner**: Node Developer
- **Due**: 2025-11-07
- **Tags**: stage1, testing

## 4. Security & Ops

### Task: Agent signature verification
- **Description**: Интегрировать Python `verify_package` в агент, обеспечить проверку архива/подписи.
- **Owner**: Security Engineer + Node Developer
- **Due**: 2025-11-03
- **Tags**: stage1, security

### Task: Audit log shipper integration
- **Description**: Отправка лога диагностики в SIEM, проверка совместимости с требованиями Stage 0.
- **Owner**: SecOps
- **Due**: 2025-11-15
- **Tags**: stage1, logging

### Task: Review & harden JNI native layer
- **Description**: Провести код-ревью C++ слоя, проверить обработку ошибок и освобождение ресурсов.
- **Owner**: Security + C++ Lead
- **Due**: 2025-11-15
- **Tags**: stage1, review

## 5. Testing & QA

### Task: Implement JNI unit tests (GoogleTest)
- **Description**: Реализовать тесты из `docs/tech/stage1-test-plan.md` (JNI-001–JNI-003), интегрировать в CI.
- **Owner**: QA + C++ Dev
- **Due**: 2025-11-08
- **Tags**: stage1, testing, jni

### Task: Kotlin test suite
- **Description**: Написать тесты KOT-001–KOT-002 с MockK, покрыть ошибки и таймауты.
- **Owner**: Kotlin Dev
- **Due**: 2025-11-09
- **Tags**: stage1, testing, kotlin

### Task: Agent API tests
- **Description**: Реализовать AGT-001–AGT-004 (Node Test Runner + supertest), добавить в CI.
- **Owner**: Node Dev
- **Due**: 2025-11-12
- **Tags**: stage1, testing, agent

### Task: Security negative tests
- **Description**: Выполнить SEC-001 сценарий (импорт неподписанных пакетов), задокументировать результаты.
- **Owner**: SecOps
- **Due**: 2025-11-14
- **Tags**: stage1, testing, security

### Task: Performance benchmark
- **Description**: Собрать метрики PERF-001 (latency PID read) на loopback адаптере.
- **Owner**: QA
- **Due**: 2025-11-16
- **Tags**: stage1, testing, performance

## 6. Demo & Documentation

### Task: Prepare end-to-end demo script
- **Description**: Сценарий демонстрации для руководства: виртуальный адаптер → чтение DTC → отчёт.
- **Owner**: Product + QA
- **Due**: 2025-11-18
- **Tags**: stage1, demo

### Task: Update documentation
- **Description**: Обновить `docs/tech/stage1-kiosk-agent-plan.md`, `docs/windows-app-analysis.md`, `docs/internal/update-playbook.md` по итогам Stage 1.
- **Owner**: Tech Writer / Release
- **Due**: 2025-11-20
- **Tags**: stage1, docs

Для импорта задач используйте `python tools/security/export_security_backlog.py --input docs/internal/stage1-pass-thru-backlog.md --output outbox/stage1-pass-thru-backlog.json --timestamp --azure-csv outbox/stage1-pass-thru-backlog-azure.csv` и загрузите сформированные `outbox/stage1-pass-thru-backlog.json` или `outbox/stage1-pass-thru-backlog-azure.csv` в трекер. После импорта обновите соответствия в `docs/internal/stage1-plan-backlog-map.md`.

Тестовое покрытие связывайте с задачами через `docs/internal/stage1-test-backlog-map.md`.
Результаты запусков тестов протоколируйте в `docs/internal/stage1-test-run-log.md`.
