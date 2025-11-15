# Stage 1 — План разработки PassThruClient и киоск-агента

## Цели Stage 1
- Реализовать `PassThruClient` с JNI-обёрткой поверх J2534 драйверов.
- Подготовить адаптированный киоск-агент с возможностью подключения к PassThruClient и выполнением базовых диагностических сценариев.
- Обеспечить интеграцию с подготовленными DTC-пакетами (`.obdresource`).
- Поддержать требования безопасности (подписанные пакеты, журналирование) в рабочем прототипе.

## Milestones
1. **JNI Core (Недели 1–2)**
   - Сборка C++ слоя, экспорт методов `passThruOpen`, `passThruConnect`, `passThruReadMsgs`, `passThruWriteMsgs`, `passThruIoctl`.
   - Юнит-тесты JNI обёртки на Windows + тестовый адаптер (виртуальный/loopback).
2. **Kotlin Service (Недели 2–3)**
   - Реализация `PassThruClient` API согласно `docs/tech/pass-thru-client-spec.md`.
   - Сервис управления сессией, ошибки, таймауты.
3. **Diagnostic Scenarios (Недели 3–4)**
   - Скрипты чтения/очистки DTC, чтения PID, опрос VIN.
   - Привязка к UI макетам (минимальный прототип). 
4. **Data Integration (Неделя 4)**
   - Импорт `.obdresource` пакетов в SQLite.
   - API для отображения описаний DTC.
5. **Security Controls & Testing (Неделя 5)**
   - Проверка подписи на стороне агента.
   - Логи операций (подписи, импорт, диагностика) в соответствии с `update-playbook`.
   - Выполнение ключевых тестов согласно `docs/tech/stage1-test-plan.md`.
6. **Demo и Пилот (Неделя 6)**
   - Сборка end-to-end прототипа.
   - Доклад по итогу Stage 1.

## Командные роли
- **JNI/C++**: C++ разработчик + QA на уровне оборудования.
- **Kotlin сервисы**: Android/Kotlin разработчик.
- **Agent интеграция**: Node.js/TypeScript разработчик.
- **Security & Ops**: Release инженер + SecOps.

## Технические задачи
- Подготовить репозиторий `packages/pass-thru-jni` с build system (CMake + Gradle).
- Настроить CI для сборки JNI и выполнения unit-тестов.
- Реализовать модуль `apps/kiosk-agent/src/devices/passThruClient.ts`.
- Подготовить mocks/симуляторы для dev-окружения без физического адаптера.
- Импорт DTC-пакетов в SQLite через `apps/kiosk-agent/src/dtc/importer.ts`.
- Расширение `tools/data-migration/prepare_resources.py` для генерации индексов SQLite.

## Зависимости
- Итоги встречи Stage 0 по безопасности (подтверждение инфраструктурных задач).
- Доступ к J2534 тестовым адаптерам и драйверам.
- Окружение CI с поддержкой Native Toolchain.

## Acceptance Criteria Stage 1
- Успешное прохождение end-to-end сценария: подключение к адаптеру → чтение DTC → импорт описаний из `.obdresource` → отображение в UI → логирование событий.
- Подеплойный пакет `.obdresource` импортируется и проверяется агентом.
- `PassThruClient` покрыт unit-тестами и базовыми интеграционными тестами (loopback/симулятор).

## Следующие шаги
1. После встречи Stage 0 утвердить бюджет времени и команды для Stage 1.
2. Создать репозитории/модули (`packages/pass-thru-jni`, `apps/kiosk-agent` обновления).
3. Подготовить backlog задач по разделам (JNI, Kotlin, Agent, Security, Testing) с ссылками на этот документ (`docs/internal/stage1-pass-thru-backlog.md`) и тест-план (`docs/tech/stage1-test-plan.md`).
4. Запустить Stage 1 спринт после утверждения планов инфраструктурой.
5. Поддерживать таблицу соответствия плана и backlog в `docs/internal/stage1-plan-backlog-map.md`.
