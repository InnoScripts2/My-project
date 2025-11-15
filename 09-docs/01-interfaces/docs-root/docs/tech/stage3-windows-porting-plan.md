# Stage 3 — План переноса Windows-приложения

## Цели

- Снять зависимость от WinForms-клиента и J2534 P/Invoke, перенести на Android стек (Kotlin + JNI + C++).
- Расчленить монолитный `Program.cs` и формы `AlphaRomeoFifteen` на независимые сервисы, извлечь бизнес-логику и переписать UI.
- Обеспечить совместимость с существующими `.obdresource`, seed-key алгоритмами и VIN декодером.
- Подготовить дорожную карту перехода: анализ → декомпозиция → реализация → тестирование.

## Исходные наблюдения

- Главная форма `AlphaRomeoFifteen` выполняет всё управление сессией, выбирает адаптер, держит таймеры `Tester Present`, шьёт сообщения UDS/OBD; логика перемешана с UI.
- `lib/Interface/J2534.cs` реализует PassThru API через `LoadLibrary` и P/Invoke; поддерживаются расширения J2534-2, фильтры, CAN sniffer, периодические сообщения.
- `lib/Protocol/*.cs` формируют кадры для служб `0x10`, `0x11`, `0x18`, `0x22`, `0x27`, `0x31`, `0x3E`, `0x85`; каждое окно содержит математику и парсинг ответа.
- `lib/Algorithms/SecurityAlgorithms.cs` и `SecurityKeys.xml` проводят seed-key расчёты; нужен перенос в безопасный сервис.
- `lib/Protocol/DTC` хранит справочники брендов; уже нормализованы в Stage 0, поставляются через `.obdresource`.
- `Program.cs` содержит вспомогательные классы (логирование, криптография, обновления, обфускация), которые в новой системе нужно заменить на документированные сервисы.

## Целевое разбиение

| Windows компонент | Новая реализация |
|-------------------|------------------|
| P/Invoke PassThru (`J2534.cs`, `connectSelectedJ2534Device.cs`) | C++ модуль `libs/cpp/pass-thru-jni` с JNI, Kotlin-обёртка `PassThruClient`, Node-совместимость обеспечивается gRPC/IPC (до удаления агента). |
| Формы UDS/OBD (`lib/Protocol/*.cs`) | Kotlin сценарии `UdsScenarioService`, `ObdService`; UI компоненты Android Compose/Electron Shell; правила формирования кадров вынесены в тестируемые классы. |
| CAN Sniffer, periodic сообщения | Нативный сервис `CanSnifferService` (C++ + Kotlin), отдельный dev-профиль в Android. |
| Security Algorithms | Kotlin модуль `SecurityAccessService` (возможен перенос в Python модуль при необходимости), хранение ключей в зашифрованном контейнере. |
| VIN Decoder | Kotlin/Python модуль `VinDecoder`, данные из JSON (Stage 0). |
| Логи и отчёты | Объединённый лог `diagnostics.log.jsonl` + экспорт отчётов в `.obdreport`. |

## План работ

1. **Аналитика и декомпозиция**
   - Зафиксировать диаграммы последовательности для сценариев: подключение → чтение DTC → очистка → tester present → sniffer.
   - Выписать параметры `SConfig` и `Ioctl`, используемые в Windows клиенте, подготовить спецификацию конфигов для JNI.
   - Оценить зависимости от DarkUI и других WinForms компонентов, определить эквиваленты в Android/Compose.
2. **Проектирование Android стека**
   - Описать API Kotlin сервиса `PassThruSession` (lifecycle, таймауты, подписки на события).
   - Спроектировать модель данных для журналов (операции PassThru, seed-key, sniffer) и синхронизацию с отчетами Python.
   - Определить интерфейсы для интеграции Python аналитики (DTC расшифровка, отчёты) через gRPC/IPC.
3. **Реализация C++/JNI**
   - Создать каркас `libs/cpp/pass-thru-jni`, перенести enum/структуры, реализовать безопасную загрузку DLL.
   - Добавить функции: `openAdapter`, `closeAdapter`, `connectChannel`, `disconnectChannel`, `setConfig`, `ioctl`, `writeMsgs`, `readMsgs`, `start/stopFilter`, `start/stopPeriodic`, `readVersion`, `getLastError`.
   - Покрыть GoogleTest: мок драйвера + проверка буферов, переполнение, таймауты.
4. **Kotlin сервисы**
   - Реализовать `PassThruClient` (JNI binding, coroutine-based I/O).
   - Вынести сценарии UDS/OBD в сервисы с тестами (MockK для JNI).
   - Создать `DiagnosticsSessionController` (управление UI состояниями, логика кнопок Connect, Tester Present, Bruteforce Security Access).
5. **UI Android**
   - Создать Compose-экраны: Connect, Live Session (Tester Present, DTC, PID), Security, Sniffer, Logs.
   - Интегрировать с `DiagnosticsSessionController`, обеспечить доступность и киоск-режим.
6. **Данные и отчёты**
   - Подключить импорт `.obdresource` (уже реализован в Node) к Kotlin/SQLite или общему репозиторию.
   - Убедиться в совместимости формата с Python отчётами; подготовить шаблон PDF/HTML.
7. **Тестирование и hardening**
   - Настроить unit/integration тесты Kotlin, GoogleTest, Python.
   - Подготовить hardware-in-the-loop сценарий (виртуальный адаптер или физический стенд).
   - Провести негативные тесты: неверные подписи, таймауты, нестабильное питание.

## Deliverables Stage 3

- Спецификация Android стека (диаграммы, API описания).
- Нативный модуль `pass-thru-jni` с тестовым покрытием.
- Kotlin сервисы и начальный UI прототип с базовыми сценариями (подключение, чтение DTC, tester present).
- Мигрированные алгоритмы безопасности и VIN декодера.
- Обновлённые инструкции в `docs/tech/stage1-kiosk-agent-plan.md` и `docs/internal/stage1-pass-thru-backlog.md` (зависимости Stage 3).
- Журнал тестов Stage 3 и чек-листы hardening.

## Зависимости и риски

- Драйверы J2534 на Android: требуется подтвердить, поддерживает ли целевой адаптер ARM/Android; при отсутствии — реализовать эмуляцию поверх ELM327.
- Алгоритмы seed-key могут подпадать под NDA OEM; необходимы юридические подтверждения.
- Производительность: мобильный процессор, ограничение по таймингам (канальный режим, 29bit ID) — требуется профилирование.
- Безопасность: исключить повторение обфусцированной логики `Program.cs`, документировать криптографию, обеспечить хранение ключей в TEE/Keystore.

## Следующие шаги

- Доработать Stage 1 backlog с учётом зависимостей Stage 3 (создать связанные задачи в `docs/internal/stage1-pass-thru-backlog.md`).
- Подготовить диаграммы последовательности в `docs/tech/pass-thru-sequence-stage3.md` (отдельный документ).
- Согласовать формат JNI API и Kotlin сервисов на техническом совете, зафиксировать решения в протоколе.
- Продолжить прогон тестов Stage 1 (импортер) и приступить к декомпозиции `AlphaRomeoFifteen.cs` на сценарии для Kotlin.
