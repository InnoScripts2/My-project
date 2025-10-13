# Разбор AlphaRomeoFifteen (WinForms → Android)

## Общие сведения

`AlphaRomeoFifteen` — центральная форма Windows-приложения Generic Diagnostic Tool. Она одновременно отвечает за выбор адаптера, установку каналов, управление UI вкладками, запуск tester present и выполнение диагностических сервисов. Для миграции необходимо выделить сценарии и состояния в отдельные сервисы Kotlin, оставив Android UI только для отображения.

## Слои ответственности формы

| Область | Текущая реализация | Недостатки | Целевая архитектура |
|---------|--------------------|------------|---------------------|
| Инициализация UI | `PassThru_Load`, привязка comboBox и начальные значения | Логика режимов инициализации смешана с WinForms контролами | `DiagnosticsSessionController.bootstrap()` выставляет состояния, UI реагирует через state flow |
| Выбор адаптера | `J2534DeviceFinder.FindInstalledJ2534DLLs`, заполнение `comboBoxJ2534Devices` | Нет разделения модели и представления, ошибка скрывается в `catch` | Kotlin сервис `AdapterCatalog`, выдающий список адаптеров с метаданными; UI отображает карточки |
| Подключение | `buttonConnect` → `connectSelectedJ2534Device` | Вся логика в обработчике кнопки, смешение 11 шагов; отсутствует retry/backoff | `DiagnosticsSessionController.connect(protocolConfig)` вызывает `PassThruClient`; состояние хранится в `SessionState` |
| Настройка идентификаторов | `textBoxEcuRx/TextChanged`, `checkBox29BitId_CheckedChanged` | Манипуляции со строками, парсинг в нескольких местах | Kotlin `AddressingConfig` валидирует и форматирует идентификаторы, UI только отображает |
| Отправка диагностических кадров | `buttonSendPassThruMsg_Click`, `startDiagnosticSession` | Построение кадра перехватывается прямо в UI, нет повторного использования | Kotlin сервис `DiagnosticCommandBuilder` возвращает кадры; UI просто выбирает параметры |
| Tester Present | `timerTesterPresent`, `button2_Click` | Таймер WinForms, нет централизованного контроля; ошибки не логируются | Коррутина heartbeat в `DiagnosticsSessionController`, управление через state machine |
| Bruteforce Security Access | `button6_Click_1`, `bruteforce()` | Множество `switch` в UI, отсутствуют ограничения; риск блокировки ECU | Kotlin `SecurityAccessService` с политикой попыток, аудит через журнал |
| CAN Sniffer | `startReadAllPassThruMsgsButton_Click`, `CanSniffer` форма | Привязан к Windows Thread; сложно тестировать | Dev-профиль `CanSnifferService`, передающий поток сообщений через канал |
| Логи | `Log()` пишет в TextBox и файл | Локальные методы, нет структуры форматирования | Общая система `diagnostics.log.jsonl` + `LogRepository` |

## Выделение модулей Stage 3

| Модуль Kotlin/Android | Источник WinForms | Ответственность | Зависимости |
|----------------------|-------------------|-----------------|-------------|
| `DiagnosticsSessionController` | `buttonConnect`, `PassThru_Load`, `timerTesterPresent` | Управление жизненным циклом сеанса, состояния UI, запуск heartbeat | `PassThruClient`, `AdapterCatalog`, `TesterPresentPolicy` |
| `AdapterCatalog` | `J2534DeviceFinder` | Сканирование адаптеров, кэш метаданных, фильтрация доступных устройств | JNI/C++ `scanDevices` (Stage 3) |
| `AddressingConfig` | логика `checkBox29BitId_CheckedChanged` | Парсинг/валидация 11/29-bit адресов, отображение в UI | `DiagnosticsSessionController` |
| `DiagnosticCommandBuilder` | методы `startDiagnosticSession`, `buttonSendPassThruMsg_Click` | Построение кадров UDS/OBD с учётом адресации и режима | `AddressingConfig`, справочники команд |
| `SecurityAccessService` | `bruteforce`, `requestSecurityAccess` | Seed-key вычисления, лимиты попыток, журнал событий | `SecurityAlgorithms` (перенос), `DiagnosticsSessionController` |
| `TesterPresentPolicy` | `timerTesterPresent` | Интервалы, ограничения перезапуска, обработка ошибок | `PassThruClient`, `DiagnosticsSessionController` |
| `CanSnifferService` | `CanSniffer.cs`, вызовы из `AlphaRomeoFifteen` | Прослушивание CAN шины, экспорт данных для developer mode | `PassThruClient`, каналы Kotlin |
| `UiStateStore` | разбросанные `TextBox`, `ComboBox` обновления | Хранение состояний экранов, валидация ввода | `DiagnosticsSessionController`, Compose UI |

## Требуемые точки JNI

- `listAdapters()`: вытягивает список устройств, заменяет `J2534DeviceFinder`.
- `openAdapter(adapterId)`, `closeAdapter(handle)`: уже в Stage 1; формы должны использовать Kotlin сервис.
- `connectChannel(handle, protocol, config)`, `disconnectChannel(channel)`: под управлением контроллера.
- `readFrames(channel, max, timeout)` и `writeFrames(channel, frames, timeout)`: для отправки/получения команд.
- `setPeriodicMessage(channel, frame, interval)` и `stopPeriodicMessage(handle)`: замена `PassThruStartPeriodicMsg`.
- `startSniffer(channel, filter)` и `stopSniffer(id)`: dev-функции, Stage 3.

## План декомпозиции файла

1. **Инвентаризация обработчиков**: пройтись по `AlphaRomeoFifteen.cs`, прописать каждый `event handler` в таблицу `WinForms → Target Service`. Срок: 2025-10-15.
2. **Выделение сценариев**: объединить обработчики в сценарии (подключение, чтение DTC, очистка, security access, sniffer). Срок: 2025-10-16.
3. **Создание Kotlin черновиков**: подготовить скелеты `DiagnosticsSessionController`, `AdapterCatalog`, `DiagnosticCommandBuilder` с интерфейсами. Срок Stage 3: 2025-10-20.
4. **Тестовый план**: дополнить `docs/tech/stage1-test-plan.md` разделом «Stage 3 Preview» для будущих тестов Kotlin. Срок: 2025-10-21.

## Риски и зависимости

- Требуется согласовать перенос seed-key логики (`SecurityAlgorithms.cs`) с юридической службой; до согласования реализуем заглушку.
- Для `startPeriodicMsg` нужны расширения JNI, не покрытые Stage 1; необходимо добавить задачи в backlog Stage 3.
- Предусмотреть режим «dev» без физического адаптера: используется `Dev simulator` из Stage 1.

## Следующие действия

- Обновить backlog Stage 1/Stage 3 задачами на декомпозицию (добавить ссылки на этот документ).
- Подготовить отдельный файл с перечнем всех обработчиков `AlphaRomeoFifteen` и назначением (см. пункт 1 плана).
- После успешного прогона тестов Stage 1 приступить к созданию Kotlin скелетов.
