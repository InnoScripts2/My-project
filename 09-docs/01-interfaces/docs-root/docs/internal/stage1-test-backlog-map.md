# Соответствие тест-плана Stage 1 и backlog задач

Документ отражает связь между тестами из `docs/tech/stage1-test-plan.md` и задачами `docs/internal/stage1-pass-thru-backlog.md`.

| Test ID | Описание | Backlog задача | Ответственный | Статус |
|---------|----------|----------------|---------------|--------|
| JNI-001 | `passThruOpen` возвращает валидный дескриптор | Implement PassThruOpen/Close bindings; JNI Unit Tests (loopback) | C++ Dev + QA | Pending |
| JNI-002 | `passThruReadMsgs` возвращает данные в течение таймаута | Implement Read/Write Msgs; JNI Unit Tests (loopback) | C++ Dev + QA | Pending |
| JNI-003 | `PassThruIoctl(SET_CONFIG)` применяет параметры | Implement Ioctl operations; JNI Unit Tests (loopback) | C++ Dev + QA | Pending |
| KOT-001 | `PassThruClient.connect` выбрасывает `ConnectionError` | Kotlin interface & error model; Session lifecycle management; Kotlin test suite | Kotlin Dev | Pending |
| KOT-002 | Авторазъединение/повторное подключение при таймауте | Session lifecycle management; Kotlin test suite | Kotlin Dev | Pending |
| AGT-001 | `POST /api/pass-thru/session` создаёт сессию | Node adapter for PassThruClient; Agent API tests | Node Dev | Pending |
| AGT-002 | Импорт `.obdresource` с подписью успешен | DTC package importer to SQLite; Agent signature verification; Agent API tests | Node Dev + Security | Pending |
| AGT-003 | Импорт повреждённого пакета блокируется | Agent signature verification; Security negative tests | Node Dev + SecOps | Pending |
| AGT-004 | Логи операций отправляются в мониторинг | Agent logging pipeline; Agent API tests | Node Dev + SecOps | Pending |
| SEC-001 | Отказ при отсутствии подписи + запись в журнал | Agent signature verification; Security negative tests | SecOps | Pending |
| PERF-001 | Чтение 10 PID < 200 мс (loopback) | Performance benchmark; Dev simulator | QA | Pending |

## Инструкции по обновлению
- После реализации теста укажите номер рабочей задачи (Azure Boards/Jira) и отметьте статус (`In Progress`, `Done`).
- При добавлении новых тестов в план расширьте таблицу и свяжите их с соответствующими backlog задачами.
- Таблица используется при подготовке отчёта по Stage 1 и для проверки покрытия P0 тестов.
- Результаты запусков фиксируйте в `docs/internal/stage1-test-run-log.md`.
