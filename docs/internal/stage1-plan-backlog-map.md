# Соответствие плана Stage 1 и backlog задач

Документ отражает связь между разделами `docs/tech/stage1-kiosk-agent-plan.md` и задачами из `docs/internal/stage1-pass-thru-backlog.md`.

## JNI Core (Milestone 1)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| Собрать C++ слой, экспорт `passThru*` функций | Setup C++ JNI project skeleton | Недели 1–2 | 2025-10-27 | Старт проекта; 2025-10-13 создан каркас `packages/pass-thru-jni`, загрузка PassThru DLL реализует проверку символов |
| | Implement PassThruOpen/Close bindings | Недели 1–2 | 2025-10-29 | Управление дескрипторами |
| | Implement PassThruConnect/Disconnect bindings | Недели 1–2 | 2025-11-01 | Поддержка протоколов |
| | Implement Read/Write Msgs | Недели 1–2 | 2025-11-05 | Буферизация сообщений |
| | Implement Ioctl operations | Недели 1–2 | 2025-11-07 | SET_CONFIG и пр. |
| Юнит-тесты JNI | JNI Unit Tests (loopback) | Недели 1–2 | 2025-11-08 | GoogleTest |

## Kotlin Service (Milestone 2)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| Реализация API `PassThruClient` | Kotlin interface & error model | Недели 2–3 | 2025-11-03 | Интерфейсы |
| | JNI binding integration | Недели 2–3 | 2025-11-05 | Маппинг ошибок |
| Управление сессией | Session lifecycle management | Недели 2–3 | 2025-11-07 | Таймауты, переподключение |

## Diagnostic Scenarios (Milestone 3)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| Скрипты DTC/PID/VIN | Diagnostic flows (DTC read/clear, PID read) | Недели 3–4 | 2025-11-12 | Журналирование |
| Дев-симулятор | Dev simulator | Недели 3–4 | 2025-11-07 | Mock PassThruClient |

## Data Integration (Milestone 4)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| Импорт `.obdresource` → SQLite | DTC package importer to SQLite | Неделя 4 | 2025-11-05 | Импорт данных |
| API для описаний DTC | Node adapter for PassThruClient | Недели 3–4 | 2025-11-10 | HTTP API агента |
| Синхронизация с планом переноса Windows (Stage 3) | Обновить backlog зависимостей | Stage 3 | 2025-10-20 | См. `docs/tech/stage3-windows-porting-plan.md`, `docs/tech/pass-thru-sequence-stage3.md` |

## Security Controls & Testing (Milestone 5)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| Проверка подписи в агенте | Agent signature verification | Неделя 5 | 2025-11-03 | Интеграция Python скрипта |
| Логи операций | Agent logging pipeline | Неделя 5 | 2025-11-12 | JSONL + мониторинг |
| Ревью JNI | Review & harden JNI native layer | Неделя 5 | 2025-11-15 | Security ревью |
| Тесты JNI | Implement JNI unit tests (GoogleTest) | Неделя 5 | 2025-11-08 | Совпадает с Milestone 1 |
| Тесты Kotlin | Kotlin test suite | Неделя 5 | 2025-11-09 | MockK |
| Тесты агента | Agent API tests | Неделя 5 | 2025-11-12 | Supertest |
| Security негативные тесты | Security negative tests | Неделя 5 | 2025-11-14 | SEC-001 |
| Performance benchmark | Performance benchmark | Неделя 5 | 2025-11-16 | PERF-001 |

## Demo & Pilot (Milestone 6)

| Пункт плана | Backlog задача | Срок плана | Срок backlog | Примечание |
|-------------|----------------|------------|--------------|------------|
| End-to-end демонстрация | Prepare end-to-end demo script | Неделя 6 | 2025-11-18 | Сценарий для руководства |
| Обновление документации | Update documentation | Неделя 6 | 2025-11-20 | Обновление Stage 1 документов |

## Инструкции по поддержанию таблицы

- После импорта задач добавляйте ссылки на work items и статусы в колонке “Примечание”.
- При изменении сроков в плане фиксируйте расхождение с полем `Срок backlog`.
- Таблица служит входом для отчётов Stage 1 и проверки готовности перед демо.
