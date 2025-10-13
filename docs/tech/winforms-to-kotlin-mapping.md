# Соответствие WinForms форм (`lib/Protocol/*.cs`) и целевых Kotlin компонентов

Сводка сценариев и зависимостей описана в `docs/tech/protocol-service-cards.md`.

| WinForms файл | Назначение в оригинальном приложении | Kotlin UI компонент | Kotlin сервис/модуль | Примечания по миграции |
|---------------|--------------------------------------|----------------------|----------------------|------------------------|
| `0x01 OBDII.cs` | Стандартные режимы OBD-II (Mode 01, 03, 04, 05, 06, 07, 08, 09, 0A) | `ObdLiveDataScreen`, `DtcListScreen` | `ObdPidCatalog`, `ObdModeService`, `PassThruClient` | Формирует кадры через `sendPassThruMsg`, отображает PID/статусы. В Kotlin вынести таблицы PID в конфигурацию. |
| `0x10 diagnosticSessionControl.cs` | Управление диагностическими сессиями (UDS Service 0x10) | `UdsWorkflowScreen` | `UdsScenarioService.startSession()` | Настраивает фильтры, обрабатывает multi-frame. Требуется унифицированный state machine. |
| `0x11 ecuReset.cs` | Сервис 0x11 Reset ECU | `UdsWorkflowScreen` | `UdsScenarioService.resetEcu()` | Опциональный диалог подтверждения, логирование результата. |
| `0x18 diagnosticTroubleCodes.cs` | Чтение/очистка DTC по UDS | `DtcListScreen`, `DtcClearDialog` | `DtcRepository`, `DtcService`, `PassThruClient` | Использует `sendPassThruMsg` и разбор ответов. Нужна типобезопасная модель DTC. |
| `0x22 DID.cs` | Чтение идентификаторов данных (Service 0x22) | `UdsDataScreen` | `DidCatalog`, `UdsScenarioService.readDid()` | В WinForms ввод DID вручную; в Kotlin предусмотреть пресеты и валидацию. |
| `0x23 readMemoryByAddress.cs` | Чтение памяти по адресу | `AdvancedDiagnosticsScreen` | `BinaryDumpService`, `PassThruClient` | Задействует прямые PassThru вызовы, нужен контроль размеров/таймаутов. |
| `0x27 requestSecurityAccess.cs` | Security Access (Seed/Key) | `SecurityUnlockScreen` | `SecurityAccessService`, `SeedKeyProvider` | Полагался на `Algorithms/SecurityKeys`. Требуется безопасное хранение и согласование с новым политиками. |
| `0x31 startRoutineByLocalIdentifier.cs` | Рутины (routine control) | `RoutineControlScreen` | `UdsRoutineService`, `UdsScenarioService.runRoutine()` | Обрабатывает несколько идентификаторов, возвраты статусов. |
| `0x3E testerPresent.cs` | Tester Present keep-alive | `SessionHeartbeatComponent` | `SessionHeartbeatWorker`, `PassThruClient` | В WinForms вызывается вручную; на Android превратить в автоматический heartbeat. |
| `0x7F negativeResponseCodes.cs` | Расшифровка отрицательных ответов | `DiagnosticsErrorOverlay` | `UdsErrorDecoder` | Таблица кодов; перенести в общий слой ошибок. |
| `0x85  controlDtcSetting.cs` | Управление DTC (вкл/выкл) | `DtcSettingsScreen` | `UdsScenarioService.controlDtcSetting()` | Требует подтверждения клиента и журналирования. |
| `Protocol.cs` | Общие утилиты/структуры | — (интегрировать в инфраструктуру) | `UdsConstants`, `PassThruMessage` | Содержит модель `PassThruMsg`, вспомогательные методы. В Kotlin заменить собственными DTO. |
| `sendPassThruMsg.cs`, `receivePassThruMsg.cs` | Универсальные функции отправки/чтения | `DiagnosticsSessionController` | `PassThruClient` | Формируют каркас операций; на Android заменяются JNI-слоем. |
| `CanSniffer.cs` (из `Interface`) | Прослушка CAN с фильтрами | `CanMonitorScreen` | `CanSnifferService` | Требует потоковой визуализации, хранение истории. |
| `connectSelectedJ2534Device.cs` | Выбор адаптера, установка соединения | `AdapterPickerScreen` | `AdapterRegistry`, `PassThruClient` | Логика выбора DLL переезжает в JNI/конфиги. |
| `J2534DeviceFinder.cs` | Поиск драйверов в реестре | — (только desktop) | `AdapterRepository` | На Android заменяется данными конфигурации/встроенными драйверами. |

## Переиспользование вспомогательных компонентов
- `diagnosticTroubleCodes`, `OBDII`, `testerPresent` и др. используют общие методы из `Protocol.cs` — переносим в Kotlin в виде `CommandBuilder` и `ResponseParser`.
- Логирование (`log.cs`, `addTxtCAN.cs`) трансформируем в `DiagnosticsLogger`, общий для UI и backend.
- Все формы зависят от `AlphaRomeoFifteen` как контейнера вкладок. В Kotlin эту роль выполняет `DiagnosticsSessionController` + навигация Jetpack Compose.

## План миграции
1. **Анализ входных параметров**: для каждой формы зафиксировать необходимые поля UI (VIN, адрес блока, значения DID) и правила валидации.
2. **Выделение сценариев**: сгруппировать формы в сценарии (базовая диагностика, расширенные процедуры, безопасность) и задокументировать последовательности.
3. **Проектирование Kotlin сервисов**: определить интерфейсы `PassThruClient`, `UdsScenarioService`, `SecurityAccessService`, `CanSnifferService` с новыми DTO.
4. **Создание UI-макетов**: сформировать прототипы экранов в `apps/kiosk-frontend`/`android-kiosk` с учётом UX-правил Stage 0.
5. **Отказ от WinForms-специфики**: удалить зависимость от `Marshal`, `IntPtr` в бизнес-логике — заменить собственными абстракциями JNI.
