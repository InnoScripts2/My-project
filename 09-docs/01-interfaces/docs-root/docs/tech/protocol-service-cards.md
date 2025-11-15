# Карточки сценариев `lib/Protocol`

Источник: WinForms форма `AlphaRomeoFifteen` в `блок 4/lib/Protocol/*.cs`. Каждая карточка фиксирует назначение сервиса, входные данные, выходные данные и зависимости бизнес-логики для миграции в Kotlin + JNI.

## 0x01 — `0x01 OBDII.cs`
- **Назначение:** стандартные режимы OBD-II (Mode 01–0A). Управляет выбором PID, чтением VIN/CALID, очисткой DTC.
- **Входы UI:** `comboBoxPids` (список PID), кнопки для Mode 03/04, текстовые поля VIN/CALID.
- **Выходы:** обновление `textBoxPid`, `textBoxVin`, `textBoxCalId`, `listBoxDtc`. Использует строковые ответы ECU для отображения.
- **Зависимости:** `sendPassThruMsg`, `HexToASCII`, глобальные поля `ecuId`, `ecuId2`. Требует синхронного запроса и парсинга строк.
- **Миграция:** выделить `ObdModeRequest` DTO, вынести таблицу PID из UI в конфиг, заменить манипуляции со строками на бинарное декодирование в Kotlin.

## 0x10 — `diagnosticSessionControl.cs`
- **Назначение:** UDS Service 0x10 (Diagnostic Session Control). Открывает расширенные сессии.
- **Входы:** идентификаторы кадра (`id0..id3`), выбор `sessionType` (0x81, 0x85, 0x87 и т. д.).
- **Выходы:** логирование в `Log`, отображение ошибок через `MessageBox`, возвращает `bool` для UI.
- **Зависимости:** `sendPassThruMsg`, `readPassThruMsg`, `printerr`, `Log`, глобальные `ecuId`/`ecuId2`. Ожидает ответ 0x50 или 0x7F.
- **Миграция:** реализовать state machine в `UdsScenarioService` с ожиданием ResponsePending (0x78) и автоматическим ретраем.

## 0x11 — `ecuReset.cs`
- **Назначение:** UDS Service 0x11 (ECU Reset) с выбором типа перезапуска.
- **Входы:** `resetType` в UI (hard/soft/key off-on и др.), идентификаторы кадра.
- **Выходы:** сообщения в лог, `MessageBox`, изменение статуса на форме.
- **Зависимости:** `sendPassThruMsg`, `printerr`, глобальные идентификаторы.
- **Миграция:** вынести в Kotlin подтверждение клиента, обрабатывать 0x51 (positive) и 0x7F (negative) с отображением `UdsError` overlay.

## 0x18 — `diagnosticTroubleCodes.cs`
- **Назначение:** чтение и очистка DTC (Services 0x18/0x14) и отображение справочника кодов.
- **Входы:** глобальные `ecuId`, `ecuId2`; запуск функций `readContinuousCodes`, `clearDtc`.
- **Выходы:** наполнение `dataGridView1`, установка `labelFaultsDetected`, всплывающие уведомления, использование словаря `faultCodeDictionary` и карты подтипов.
- **Зависимости:** `startDiagnosticSession`, `sendPassThruMsg`, `readPassThruMsg`, `VR_formatDTC`, `definitionLookup`, UI-компоненты.
- **Миграция:** создать `DtcService` с моделью DTC (`code`, `origin`, `isGeneric`, `subsystem`, `definition`). Справочники перенести в `libs/python`/`assets`. Избегать прямого `MessageBox` — заменить Snackbar/диалог.

## 0x22 — `DID.cs`
- **Назначение:** чтение Data Identifier (Service 0x22) и расшифровка через обширный словарь DID → описание.
- **Входы:** ввод DID, список предустановок (непосредственно в коде словаря), идентификаторы кадра.
- **Выходы:** текстовые поля с расшифровкой, лог.
- **Зависимости:** `definitions` словарь (динамически инициализируется при вызове), `sendPassThruMsg` (не реализован в фрагменте, но ожидается), общие глобальные поля.
- **Миграция:** вынести справочник в отдельный ресурс (JSON/SQLite), обеспечить ленивую загрузку. В Kotlin предусмотреть пресеты DID и защиту от чтения крупных блоков.

## 0x23 — `readMemoryByAddress.cs`
- **Назначение:** чтение памяти ECU по адресу (Service 0x23) с использованием ручного `PassThruWriteMsgs`/`PassThruReadMsgs`.
- **Входы:** адрес (`uint address`), размер блока (`blockSize`), идентификаторы кадра.
- **Выходы:** массив байтов без первых пяти служебных байтов; логирует сырые кадры.
- **Зависимости:** прямой доступ к `J2534Port.Functions`, `ChannelID`, глобальный флаг `flagNoDataAbort`. Требует ручного управления `IntPtr`.
- **Миграция:** JNI-слой должен предоставить асинхронный метод `readMemory(address, length)` с RAII и контролем таймаутов. Kotlin оборачивает в `BinaryDumpService` с ограничениями безопасности.

## 0x27 — `requestSecurityAccess.cs`
- **Назначение:** UDS Security Access (Service 0x27) — содержит методы `bruteforce`, списки ключей, подготовки Seed/Key.
- **Входы:** выбор уровня доступа, seed из ECU, словари ключей `keysDictionary`, внешние алгоритмы (`Algorithms/SecurityKeys`).
- **Выходы:** лог, уведомления, отправка ключей через `sendPassThruMsg` (в других частях файла), изменение состояния UI.
- **Зависимости:** массивы строк с кодовыми словами («FORScan keys»), `sendPassThruMsg`, генераторы обфускации (закомментированные). Взаимодействует с PowerShell для вспомогательных скриптов (также закомментировано).
- **Миграция:** реализовать безопасное хранение ключей в `SecurityAccessService` (Kotlin) с вызовом Python-библиотеки для генерации. Убрать brute-force списки или хранить в зашифрованном контейнере.

## 0x31 — `startRoutineByLocalIdentifier.cs`
- **Назначение:** UDS Service 0x31 (Routine Control), запуск диагностических процедур по локальному идентификатору.
- **Входы:** идентификаторы рутины, параметры, CAN ID.
- **Выходы:** лог с результатом, уведомления об успешном запуске/ошибке.
- **Зависимости:** `sendPassThruMsg`, глобальные поля `ecuId`, `ecuId2`, словари с описаниями рутин.
- **Миграция:** описать поддерживаемые рутины в конфигурации, реализовать асинхронное ожидание завершения и визуализацию прогресса в Kotlin `RoutineControlScreen`.

## 0x3E — `testerPresent.cs`
- **Назначение:** поддержание связи (Service 0x3E) с опцией подавления ответа.
- **Входы:** выбор режима (`requestResponse` или `suppressResponse`), идентификаторы.
- **Выходы:** лог сообщений.
- **Зависимости:** `sendPassThruMsg`, таймеры UI для периодической отправки.
- **Миграция:** реализовать heartbeat в фоне (`DiagnosticsHeartbeatWorker`), управлять жизненным циклом сессии Kotlin.

## 0x7F — `negativeResponseCodes.cs`
- **Назначение:** справочник расшифровки отрицательных ответов UDS (NRF). Предоставляет `printerr(int code)`.
- **Входы:** код ошибки из ответа ECU.
- **Выходы:** строка с описанием, используется формами (0x10, 0x11, 0x18 и др.).
- **Зависимости:** словарь `nrcCodes`/`nrcDictionary`, UI вывод через `MessageBox`.
- **Миграция:** оформить как общий `UdsErrorDecoder` с локализацией; хранить словарь в общем модуле.

## 0x85 — `controlDtcSetting.cs`
- **Назначение:** UDS Service 0x85 (Control DTC Setting) — временное отключение регистрации ошибок.
- **Входы:** параметры управления (`0x01`/`0x02`), идентификаторы.
- **Выходы:** лог, уведомление об успехе/ошибке.
- **Зависимости:** `sendPassThruMsg`, `printerr`, подтверждение пользователя.
- **Миграция:** внедрить в Kotlin с обязательным журналированием и подтверждением оператора.

## `Protocol.cs`
- **Назначение:** общий набор констант сервисов и базовых значений (`Protocol.DIAGNOSTIC_SESSION_CONTROL.service` и т. д.).
- **Зависимости:** используется всеми формами. Задаёт соответствие Service → byte.
- **Миграция:** перенести в `PassThruClient`/`UdsConstants` с использованием `enum class`.

## Общие зависимости форм
- Общие вспомогательные функции: `sendPassThruMsg`, `readPassThruMsg`, `Log`, `printerr`, `HexToASCII`, `VR_formatDTC`.
- Используют глобальные поля формы: `ecuId`, `ecuId2`, `ChannelID`, `J2534Port`, `flagNoDataAbort`.
- UI-компоненты: `dataGridView1`, `listBoxDtc`, `labelFaultsDetected`, `textBoxPid`, `textBoxVin`, `MessageBox`.
- Для миграции требуется слой: `DiagnosticsSessionController` (Kotlin) + JNI `PassThruClient` (C++) + аналитика/справочники (`libs/python`).

## Следующие шаги
1. Сформировать DTO и сервисы Kotlin по каждой карточке (см. `docs/tech/winforms-to-kotlin-mapping.md`).
2. Перенести словари DTC и DID в формат JSON/SQLite, подключить к Python-пайпу для обновлений.
3. Документировать последовательности вызовов для 0x27 и 0x31 в отдельной диаграмме последовательностей (`docs/tech/sequences/uds-routines.md`).
