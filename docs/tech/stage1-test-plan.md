# Stage 1 — План тестирования PassThruClient и киоск-агента

## 1. Цели тестирования
- Подтвердить корректность JNI-обёртки PassThru: управление дескрипторами, обработка ошибок, отправка/приём сообщений.
- Проверить сценарии диагностики в Kotlin-сервисах: чтение/очистка DTC, чтение PID, VIN.
- Убедиться, что киоск-агент импортирует и верифицирует `.obdresource` пакеты, доступ к описаниям DTC реализован корректно.
- Провести проверки безопасности: подпись пакетов, журналирование, контроль доступа к журналам.

## 2. Область покрытия
- **JNI уровень**: PassThruOpen/Close, Connect/Disconnect, Read/WriteMsgs, Ioctl (`SET_CONFIG`, `READ_VBATT`, `SET_PROG_VOLTAGE`).
- **Kotlin уровень**: интерфейсы `PassThruClient`, `PassThruSession`, управление таймаутами, ошибки соединения.
- **Agent**: REST API `/api/pass-thru/*`, импорт DTC пакета, логирование.
- **Безопасность**: проверка подписи, блокировка неподписанных пакетов, аудит.

## 3. Типы тестов
| Тип | Описание | Ответственный |
|-----|----------|---------------|
| Unit (JNI) | GoogleTest для C++ слоя с loopback-драйвером | C++ Dev + QA |
| Unit (Kotlin) | JUnit + MockK: поведение `PassThruClient`, таймауты, ошибки | Kotlin Dev |
| Integration | Тесты с виртуальным PassThru адаптером (loopback) | QA |
| Agent API | Node Test Runner: проверка REST эндпойнтов, импорт DTC | Node Dev |
| Security | Проверка подписи, попытка импорта изменённого архива | SecOps |
| Performance | Latency чтения/записи, throughput сообщений, кеширование DTC | QA |

## 4. Тестовые окружения
- **DEV**: Windows VM с виртуальным PassThru драйвером, Node.js агент в DEV-режиме.
- **QA**: Windows workstation с реальным J2534 адаптером (TBD), staging CDN для `.obdresource`.
- **CI**: GitHub Actions/Azure DevOps с нативной сборкой JNI (loopback tests).

## 5. Инструменты
- GoogleTest, Catch2 (при необходимости) для C++.
- JUnit5, MockK, kotest для Kotlin.
- Node.js + supertest для API.
- Custom loopback PassThru DLL для автоматизированных тестов.
- `tools/data-migration/verify_package.py` и `check_signing_log.py` для валидации данных и журналов.

## 6. Матрица тестирования
| Компонент | Test ID | Сценарий | Тип | Приоритет |
|-----------|---------|----------|-----|-----------|
| JNI | JNI-001 | `passThruOpen` возвращает валидный дескриптор | Unit | P0 |
| JNI | JNI-002 | `passThruReadMsgs` возвращает данные в течение таймаута | Unit | P0 |
| JNI | JNI-003 | `passThruIoctl(SET_CONFIG)` корректно применяет параметры | Unit | P1 |
| Kotlin | KOT-001 | `PassThruClient.connect` выбрасывает `ConnectionError` при отсутствии адаптера | Unit | P0 |
| Kotlin | KOT-002 | Авторазъединение и повторное подключение при таймауте | Unit | P1 |
| Agent | AGT-001 | `POST /api/pass-thru/session` создаёт сессию | API | P0 |
| Agent | AGT-002 | Импорт `.obdresource` с подписью проходит успешно | Integration | P0 |
| Agent | AGT-003 | Импорт повреждённого пакета блокируется | Security | P0 |
| Agent | AGT-004 | Логи операций отправляются в мониторинг | Integration | P1 |
| Security | SEC-001 | Попытка импорта без подписи → отказ + запись в журнал | Security | P0 |
| Performance | PERF-001 | Чтение 10 PID выполняется < 200 мс при loopback | Performance | P2 |

## 7. Артефакты
- Тест-план (этот документ) — обновляется по итогам инкрементов.
- CI отчёты (JUnit XML, GoogleTest XML).
- Логи киоск-агента (`update-agent.log`, `diagnostic.log`).
- Отчёт о покрытии (Kotlin/Node).
- Журнал прогонов `docs/internal/stage1-test-run-log.md`.
- Итоговый отчёт Stage 1 фиксируется через `docs/internal/stage1-test-report-template.md`.

## 8. Критерии выхода
- Все P0 тесты успешны на DEV и QA окружениях.
- Подтверждена корректность импортов `.obdresource` и журналирования.
- Создан демо-сценарий и проведена репетиция.
- Зафиксирован отчёт о тестировании и передан владельцу проекта.

## 9. Риски и меры
- **Недоступность адаптера**: использовать loopback и планировать окно на реальном оборудовании.
- **Нестабильные драйверы**: выделить время на отладку; предусмотреть fallback.
- **Дефицит ресурсов SecOps**: согласовать расписание аудита заранее.

## 10. Следующие шаги
1. Назначить ответственных и владельцев тест-кейсов.
2. Добавить задачи на реализацию тестов в `docs/internal/stage1-pass-thru-backlog.md`.
3. Настроить CI pipeline для запуска unit/integration тестов.
4. Поддерживать актуальность соответствия тестов и задач в `docs/internal/stage1-test-backlog-map.md`.
5. Вести журнал прогонов в `docs/internal/stage1-test-run-log.md`.
