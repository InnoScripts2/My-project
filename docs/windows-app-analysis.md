# Анализ Windows-приложения Generic Diagnostic Tool (блок 4)

## Лицензия и ограничения
- Автор: Benjamin Jack Leighton (Tester Present Specialist Automotive Solutions).
- Лицензионный заголовок в `lib/Interface/J2534.cs` и `Program.cs` требует письменного согласия автора для распространения/изменений.
- Любое копирование кода возможно только при сохранении уведомлений и при условии получения разрешения; прямой перенос исходников в публичный продукт без согласия запрещён.
- 12.10.2025 владелец проекта подтвердил право использовать DTC-справочники из блока 4 при сохранении лицензионных уведомлений.
- При портировании фиксируем, какие компоненты переписываются «с нуля», а какие переносятся после согласования.

## Структура проекта
```text
блок 4/
├─ Passthru.csproj
├─ Program.cs
├─ AlphaRomeoFifteen.* (главная форма WinForms)
├─ lib/
│  ├─ Algorithms/ (SecurityAlgorithms, SecurityKeys, XML)
│  ├─ Decoder/ (VIN_DECODER)
│  ├─ Forms/ (утилитарные формы: Hex2Dec, Info, Splash)
│  ├─ Interface/ (J2534 API, выбор устройств, CAN Sniffer, PassThru диалоги)
│  ├─ Main/ (доп. формы: лог, текстовые представления)
│  ├─ Media/ (ресурсы)
│  ├─ Protocol/
│  │  ├─ DTC/ (CSV-каталоги кодов по брендам)
│  │  └─ *.cs (реализации UDS/OBD команд 0x01, 0x10, 0x27 и др.)
│  └─ Interface/J2534_Struct.cs (структуры PassThru)
├─ Properties/ (ресурсы, настройки)
├─ packages.config (DarkUI и др.)
└─ app.manifest, app.config
```

## Основные модули и назначение

## Program.cs — поведение точки входа
- **Антиотладка `Boeing747`**: при запуске генерирует GUID тестовой сессии, в течение ~40 итераций сканирует активные процессы на наличие `dnSpy`, `dnSpy-x86`, `ILSpy`, `MegaDumper`, `ExtremeDumper`; обнаруженные процессы принудительно завершаются, затем приложение вызывает `Application.Exit()`. Дополнительно проверяется наличие каталога `%LOCALAPPDATA%\dnSpy`.
- **Контроль целостности WinAPI**: `Main` загружает `kernel32.dll`, считывает первые байты `IsDebuggerPresent`, `CheckRemoteDebuggerPresent` и `Debugger.get_IsAttached`. Если обнаружен JMP (`0xE9`) или другой патч (значение `0x33`), выполнение завершается. Механизм пригодится при формировании требований к новому агенту (решить, оставляем ли подобную защиту).
- **Проверка срока действия**: дата актуальности вычисляется функцией `GetExpirationDate()` (жёстко зашито `2026-01-01`). Фактическое время берётся с HTTP-заголовка `Date` сайта `http://www.testerpresent.com.au/`; при ошибке используется локальное время. Просрочка приводит к немедленному `Application.Exit()`.
- **Запуск UI**: после успешных проверок вызывается `ApacheHelicopter()`, который включает визуальные стили WinForms и открывает `PassThruJ2534.lib.Forms.Splash`. Это единственный прямой переход от точки входа к остальному приложению.
- **Системные утилиты**: в файле присутствуют вспомогательные методы `ExecutePowerShellCommand` (добавление `FoA Orion Comms.exe` в список исключений Windows Defender), `GenerateTestID`, `RandomStringGenerator`. В текущей сборке они не вызываются, но требуют аудита при переносе.
- **Обфускационные классы**: многочисленные типы `Quantum*`, `UltraComplexSystem`, `RandomGenerator` и т. п. выполняют бесполезные вычисления (фракталы, гипотетические «квантовые» процессы). Их можно игнорировать при миграции; прямых зависимостей остального кода от них нет.

## Последовательность работы приложения
1. **Инициализация**: `Program.Main` готовит глобальные сервисы, загружает настройки, включает тёмную тему DarkUI.
2. **Выбор устройства**: форма `connectSelectedJ2534Device` получает список зарегистрированных адаптеров через `PassThruScanForDevices`.
3. **Подключение**: после выбора адаптера вызываются `PassThruOpen` и `PassThruConnect` с параметрами протокола и скорости; результат сохраняется в общем контексте.
4. **Конфигурация**: через `PassThruIoctl` настраиваются тайминги, фильтры, напряжение (`SConfig`).
5. **Диагностические операции**:
   - формирование кадра UDS/OBD в формах `lib/Protocol` (структура `PassThruMsg`);
   - отправка через `PassThruWriteMsgs`, чтение `PassThruReadMsgs` с учётом таймаута;
   - парсинг ответа, вывод DTC, обработка негативных ответов (0x7F).
6. **Дополнительные функции**: CAN Sniffer, лог-файл, декодирование VIN, массовая отправка сообщений.
7. **Завершение**: закрытие соединений (`PassThruDisconnect`, `PassThruClose`), выгрузка библиотеки (`FreeLibrary`).

## Артефакты для переноса
| Компонент | Целевая реализация |
|-----------|--------------------|
| Структуры и enum’ы PassThru (`J2534_Struct.cs`, перечисления) | Переписать в C++ (JNI) и Kotlin, сохранить идентичные значения. |
| Логика подключения/отключения (`PassThruOpen`, `PassThruConnect`, `SetConfig`) | Реализовать в C++ слое (обёртка над J2534 DLL) с JNI-интерфейсом. |
| Последовательности UDS/OBD (`lib/Protocol/*.cs`) | Вынести алгоритмы формирования кадров в Kotlin, низкоуровневую отправку доверить C++. |
| Обработка DTC (CSV-файлы) | Конвертировать в единый формат (CSV/JSON) и использовать в Kotlin или Python. |
| Алгоритмы безопасности (`SecurityAlgorithms.cs`) | Перевести в Kotlin или Python с учётом требований безопасности. |
| VIN decoder | Реализовать на Kotlin или Python, сохранив логику разложения VIN. |

## Требующие внимания особенности
- **PInvoke и unsafe**: прямые вызовы DLL нужно заменить C++/JNI слоем, который предоставит аналог PassThru API в Android.
- **Логика в UI**: бизнес-правила зашиты в обработчики WinForms; их следует вынести в сервисы до миграции.
- **Параметры таймингов**: значения P* и W* из `SetConfig` фиксируем и переносим в конфиги Android.
- **Ресурсы DTC**: проверить лицензии и размер CSV; определить формат хранения в мобильной версии.
- **Крипто и обновления**: `Program.cs` содержит утилиты шифрования и автообновления; решить, переносим ли их или пишем заново.

## План переписывания (выдержка)
1. **Спецификация API**: описать минимальный набор функций Android-клиента (подключение, чтение/очистка DTC, произвольные кадры, мониторинг CAN).
2. **JNI/C++ слой**: реализовать ядро PassThru в `libs/cpp`, предусмотреть плагины (J2534, ELM327, виртуальный драйвер).
3. **Kotlin-сервисы**: создать слой сценариев диагностики, использующий JNI API; UI работает только с сервисами.
4. **Python-аналитика**: использовать для расшифровки DTC, генерации отчётов и сложных расчётов при необходимости.
5. **Ресурсы**: перенести CSV/таблицы в `assets/dtc`, обеспечить удобный парсинг на Android.
6. **Тестирование**: подготовить тесты для каждого сценария (unit + hardware-in-the-loop), использовать эмулятор адаптера в DEV.

## Следующие действия (Этап 0)
|-----|------------|-------------------|--------------------|
| `PassThruScanForDevices` | `lib/Interface/connectSelectedJ2534Device.cs` | Получение списка зарегистрированных адаптеров | out-буфер `PASSTHRU_HWTYPE`, размер буфера |
| `PassThruOpen` | `lib/Interface/connectSelectedJ2534Device.cs` | Инициализация выбранного адаптера | `DeviceName`, `DeviceID`, указатель на канал |
| `PassThruConnect` | `lib/Interface/connectSelectedJ2534Device.cs` | Подключение к шине | `ProtocolID`, `Flags`, `Baudrate`, handle канала |
| `PassThruDisconnect` | `lib/Interface/connectSelectedJ2534Device.cs` | Завершение сеанса | handle канала |
| `PassThruClose` | `Program.cs`, завершающий поток | Освобождение адаптера | handle устройства |
| `PassThruStartMsgFilter` | `lib/Interface/CanSniffer.cs` | Настройка фильтров CAN | `FilterType`, `Mask`, `Pattern`, `FlowControl` |
| `PassThruIoctl` | `lib/Interface/connectSelectedJ2534Device.cs`, `CanSniffer.cs` | Конфигурация таймингов, напряжений, periodic сообщений | `SConfigList`, `IoctlID` (`SET_CONFIG`, `READ_VBATT`, `SET_PROG_VOLTAGE`) |
| `PassThruWriteMsgs` | `lib/Protocol/*.cs`, `CanSniffer.cs` | Отправка UDS/OBD кадров и произвольных сообщений | массив `PassThruMsg`, `NumMsgs`, `Timeout` |
| `PassThruReadMsgs` | `lib/Protocol/*.cs`, `CanSniffer.cs` | Чтение ответов и потоков CAN | буфер `PassThruMsg`, `NumMsgs`, `Timeout` |
| `PassThruReadVersion` | `lib/Interface/connectSelectedJ2534Device.cs` | Получение версии DLL/аппаратуры | строковые буферы DLL, API, протокола |
| `PassThruGetLastError` | `Program.cs` (обработка исключений) | Диагностика ошибок | строковый буфер для описания |

> TODO: в Kotlin/C++ слое зафиксировать сигнатуры аналогов и модели ошибок, поддержать буферы UTF-8.

## Stage 0 — текущий статус
- Обзор Windows-приложения завершён: структура, модули, последовательности и артефакты задокументированы.
- Матрица PassThru, соответствие экранов, план миграции данных и черновик JNI API готовы.
- Зафиксировано соответствие форм `lib/Protocol/*.cs` будущим Kotlin-компонентам в `docs/tech/winforms-to-kotlin-mapping.md`.
- Реализован скрипт `tools/data-migration/prepare_resources.py` для нормализации ресурсов.
- Подготовлены скрипты `sign_package.py`, `verify_package.py`, шаблон `templates/dtc-manifest.json` и операторский регламент `docs/internal/update-playbook.md`.
- Зафиксирован полный список вызовов PassThru API в `docs/tech/pass-thru-api-calls.md`.
- Зафиксированы требования к подписанным обновлениям в `docs/tech/update-security-requirements.md`.
- Сформирован план внедрения требований безопасности в `docs/tech/update-security-implementation-plan.md`.
- Подготовлена повестка встречи с инфраструктурой в `docs/tech/update-security-infra-meeting.md`.
- Созданы вспомогательные материалы для встречи (приглашение, протокол, чек-лист) в `docs/internal/update-security-*.md`.
- Скрипт `tools/data-migration/sign_package.py` дополняет журнал `logs/signing.log` согласно регламенту.
- Описан формат журнала подписи в `docs/tech/signing-log-format.md`.
- Чек-лист аудита журнала подписей доступен в `docs/internal/signing-log-audit-checklist.md`.
- Добавлен валидатор `tools/data-migration/check_signing_log.py` для автоматической сверки журнала подписей.
- Подготовлен шаблон follow-up письма в `docs/internal/update-security-meeting-followup-template.md`.
- Выполнено повторное подписание пилотного пакета; журнал `logs/signing.log` содержит первую запись, проверенную `check_signing_log.py`.
- Создан черновой протокол встречи `docs/internal/update-security-meeting-notes-20251015.md`.
- Сформирован backlog задач для трекера в `docs/internal/update-security-boards-backlog.md`.
- Реализован экспорт backlog в JSON через `tools/security/export_security_backlog.py`, файл выгрузки сохраняется в `outbox/security-backlog-tasks.json`.
- Создан экспорт Stage 1 backlog в `outbox/stage1-pass-thru-backlog.json` для импорта задач PassThruClient.
- Экспортирующие команды формируют также CSV для Azure Boards: `outbox/security-backlog-tasks-azure.csv` и `outbox/stage1-pass-thru-backlog-azure.csv`.
- Подготовлено приглашение `outbox/update-security-infra-meeting.ics` и ссылка добавлена в `docs/tech/update-security-infra-meeting.md`.
- Созданы шаблон заметок `docs/internal/notes/2025-10-15-security-infra-meeting-notes.md` и журнал `logs/security-infra-meeting-20251015.jsonl` для фиксации результатов встречи.
- Описана процедура загрузки backlog в трекер в `docs/internal/update-security-backlog-import.md`.
- Составлено соответствие плана и backlog задач в `docs/internal/update-security-plan-backlog-map.md`.
- Сформирован Stage 1 мэппинг плана и backlog в `docs/internal/stage1-plan-backlog-map.md`.
- Добавлен мэппинг тест-плана и задач Stage 1 в `docs/internal/stage1-test-backlog-map.md`.
- Создан журнал прогонов Stage 1 тестов `docs/internal/stage1-test-run-log.md`.
- Подготовлен шаблон отчёта по итогам тестов Stage 1 `docs/internal/stage1-test-report-template.md`.
- Подготовлен план Stage 1 в `docs/tech/stage1-kiosk-agent-plan.md` (PassThruClient, интеграция киоск-агента).
- Создан backlog Stage 1 в `docs/internal/stage1-pass-thru-backlog.md`.
- Подготовлен тест-план Stage 1 в `docs/tech/stage1-test-plan.md`.
- Сформирован и проверен тестовый пакет `dist/dtc.landrover.2025.q4-dev.obdresource` (4869 записей, SHA-256 `fcf4b533b3ee9f21ed1583499002f243a148579dbace03d9952a798b91b5ef3a`, `keyId` `primary`), подпись проверена `tools/data-migration/verify_package.py`.
- Согласована спецификация `PassThruClient` (Stage 1 ограничения зафиксированы в `docs/tech/pass-thru-client-spec.md`).

## Соответствие WinForms экранов и будущих Kotlin-модулей
| WinForms форма | Назначение | Kotlin UI слой | Kotlin/C++ сервис |
|----------------|-----------|----------------|-------------------|
| `AlphaRomeoFifteen` (главная) | Каркас вкладок, логов | `ScreenShell`, `DiagnosticsHomeScreen` | `DiagnosticsSessionController` |
| `CommonUDS.cs` | Базовые UDS-запросы | `UdsWorkflowScreen` | `UdsScenarioService` + `PassThruClient` |
| `OBDGlobalRead.cs` | Чтение PID OBD-II | `ObdLiveDataScreen` | `ObdPidService` |
| `ReadDTC.cs` | Чтение кодов неисправностей | `DtcListScreen` | `DtcService` |
| `ClearDTC.cs` | Сброс DTC | `DtcClearDialog` | `DtcService.clear()` |
| `CanSniffer.cs` | Прослушивание CAN | `CanMonitorScreen` | `CanSnifferService` |
| `KeyGenerator.cs` (из `Algorithms`) | Seed-key вычисления | `SecurityUnlockScreen` | `SecurityAccessService` |
| `VinDecoder.cs` | Расшифровка VIN | `VinDecoderScreen` | `VinDecoderService` (можно реализовать на Python) |
| `Hex2Dec.cs`, `Info.cs` | Утилиты | Вспомогательные фрагменты | Повторное использование в Kotlin toolkit |

> Kotlin UI опирается на `DiagnosticsSessionController`, который маршрутизирует запросы к JNI и Python слоям.

## Ресурсы DTC и вспомогательные данные
- Каталог `lib/Protocol/DTC/` содержит CSV/TSV файлы по брендам (`ALFA_ROMEO`, `FIAT`, `GM`, `Generic_Codes.csv`). Требуется конвертация в унифицированную кодировку (UTF-8) и схему (столбцы: `code`, `description_ru`, `description_en`, `severity`).
- Файл `Generic_Codes.csv` используется по умолчанию; отдельные файлы под бренды подменяют описание. В Android планируем хранить их в `assets/dtc/` и загружать в кеш SQLite при первом запуске.
- Расчёт VIN: каталог `lib/Decoder/` содержит XML/CSV для проверки контрольной суммы и идентификации производителя; конвертировать в JSON и припаковать в модуль Python для дальнейшей поддержки.
- Security ключи: `lib/Algorithms/SecurityKeys.xml` (если присутствует) переносим в зашифрованный ресурс, доступный только в DEV.

> Скрипт миграции реализован в `tools/data-migration/prepare_resources.py`; пробные прогоны от 12.10.2025 задокументированы ниже.

### Результаты пробного экспорта ресурсов (12.10.2025)
- Команда запуска: `python tools/data-migration/prepare_resources.py --dtc ".\\блок 4\\lib\\Protocol\\DTC" --decoder ".\\блок 4\\lib\\Decoder" --output ".\\tmp-emulator-test\\migration-output"`.
- Нормализованы 28 справочников DTC (форматы CSV/TXT/MD) в каталог `tmp-emulator-test/migration-output/dtc/`.
- Совокупный объём JSON после нормализации: 2,22 МБ (16 214 записей). Крупнейшие наборы: `LANDROVERDTC` (4 462 записей, 621 КБ) и `GENERIC_DTC` (3 206 записей, 455 КБ).
- `dtc_GENERIC_CODES.json` содержит 474 записи (67,4 КБ) — дубликаты кодов устранены при нормализации.
- `tmp-emulator-test/migration-output/vin_manifest.json` фиксирует 2 артефакта VIN-декодера (README, `VIN_DECODER.cs`); файл манифеста занимает 385 байт, SHA-256 `a26325a41506726b069b213e77ce9232776b099e5efc03ca3cea9a5d4114322b` (исходные файлы: 14 байт и 4 000 байт).
- Разрешение на использование каталогов подтверждено владельцем 12.10.2025; необходимо сохранить уведомления об источниках (`LandRoverDTC*.md`, `Generic_DTC.txt`) в итоговой поставке.

### Варианты поставки нормализованного набора DTC
- **Поставка в составе APK (`assets/dtc/` + Room/SQLite миграция)**: 2,22 МБ укладываются в лимиты базового APK, нет сетевой зависимости, но объём вырастет при добавлении локализаций; апдейт данных равен обновлению приложения.
- **Play Asset Delivery (install-time bundle)**: позволяет изолировать DTC-пакет и держать основной APK компактным; обновления каталога не требуют релиза приложения, но добавляют сложность пайплайна сборки и требуют Google Play.
- **On-demand загрузка из подписанного CDN**: минимальный APK, мгновенные ревизии данных; необходим офлайн-кеш и контроль целостности, повышенные требования к защите API и лицензии на распространение.
- **Комбинированный подход**: базовый generic-набор в APK, брендовые расширения через PAD или on-demand; снижает риск превышения лимитов и упрощает офлайн-сценарии.

> Критерии выбора: офлайн-доступ терминала, политика обновлений, доступность Google Play, требование владельца к сроку обновления каталогов.

### Решение по поставке DTC данных (Stage 1)
- Терминал имеет интернет-подключение, но киоск обязан функционировать офлайн; базовый набор DTC должен быть доступен без сети и без зависимости от Google Play.
- Обновления каталогов происходят нерегулярно; нужен канал для оперативного выпуска исправлений через интернет и резервная процедура без сети.
- Выбран комбинированный вариант: 
   - generic-набор (коды SAE/OBD-II общего назначения и VIN артефакты) упаковываем в APK в `assets/dtc/` и мигрируем в локальную SQLite при первом запуске;
   - брендовые каталоги (Land Rover, Chrysler, Ford и др.) публикуем как внешние пакеты данных (`.obdresource`) с подписью; агент киоска проверяет подпись и кеширует их для офлайн-доступа.
- План обновлений: при выпуске новой версии каталога генерируем пакет; при наличии сети агент скачивает его по HTTPS из подписанного репозитория, при отсутствии — оператор доставляет архив через SFTP/USB; после проверки подписи запускаем миграцию в SQLite без обновления приложения.
- Требуется подготовить формат метаданных пакета (`manifest.json` + SHA-256), описание процесса подписи и инструкцию операторам.

### Спецификация внешних пакетов DTC (`.obdresource`)
- **Формат контейнера**: ZIP-архив с расширением `.obdresource`. Содержимое:
   - `manifest.json` — метаданные пакета;
   - `data/` — каталоги `dtc_*.json` в формате, совместимом с `prepare_resources.py`;
   - `licenses/` — исходные уведомления (`LandRoverDTC.md`, `Generic_DTC.txt` и др.).
- **Подпись**: файл `<package>.obdresource.sig` (Ed25519) создаётся отдельно и публикуется рядом с архивом; подписывается двоичное содержимое `.obdresource` после финального пересчёта контрольной суммы.
- **Структура `manifest.json`**:
   - `packageId` — строковый идентификатор (например, `dtc.landrover.2025.q3`);
   - `version` — семантическая версия каталога;
   - `checksum` — SHA-256 всего архива без `signature.sig`;
   - `records` — суммарное число записей во всех файлах;
   - `appMinVersion` — минимальная версия киоск-приложения, совместимая с пакетом;
   - `createdAtUtc` — ISO 8601;
   - `notes` — краткое описание изменений.
- **Подпись**: архив подписывается офлайн-ключом Ed25519, публичный ключ прошивается в агент. Проверка подписи — обязательное условие импорта.
- **Контрольная сумма**: поле `checksum` в `manifest.json` хранит SHA-256 канонического архива (без файла подписи). Для вычисления поле `checksum` временно обнуляется; скрипты подписи и проверки используют идентичную процедуру.
- **Процесс обновления**:
 1. Python-скрипт миграции собирает пакет, пересчитывает `records`, обновляет `manifest.json`, формирует канонический архив и вычисляет `checksum`.
 2. Генерируется файл подписи `<package>.obdresource.sig`; архив и подпись публикуются в HTTPS-репозитории и/или передаются операторам.
 3. Агент киоска скачивает или принимает файл, валидирует подпись и контрольную сумму.
 4. После успешной проверки данные импортируются в локальную SQLite; старые записи бренда помечаются устаревшими и заменяются.
- **Пилотный выпуск**: сформирован пакет `dist/dtc.landrover.2025.q4-dev.obdresource` (4869 записей, SHA-256 `fcf4b533b3ee9f21ed1583499002f243a148579dbace03d9952a798b91b5ef3a`, `keyId` `primary`), подпись проверена `tools/data-migration/verify_package.py`.
- **Логи и аудит**: агент фиксирует события загрузки (источник, checksum, версия) и сохраняет копию `manifest.json` в журнале обновлений.
- **Оффлайн-доставка**: оператор копирует `.obdresource` на USB, агент автоматически обнаруживает файл, предлагает подтвердить импорт, далее следует процедура проверки подписи и обновления.

#### Шаблон `manifest.json`
```json
{
   "packageId": "dtc.brand.placeholder",
   "version": "2025.10.0",
   "checksum": "<sha256 без signature.sig>",
   "records": 0,
   "appMinVersion": "1.0.0",
   "createdAtUtc": "2025-10-12T00:00:00Z",
   "notes": "Initial release"
}
```

#### Процедура подписи (release engineer)
1. Запустить `python tools/data-migration/prepare_resources.py` с параметрами бренда, получить JSON-файлы в `tmp-emulator-test/migration-output/dtc`.
2. Сформировать рабочий каталог пакета (`build/dtc-package/<brand>`), скопировать туда папки `data/` и `licenses/`, разместить `manifest.json` по шаблону.
3. Выполнить скрипт `tools/data-migration/sign_package.py --input build/dtc-package/<brand> --key keys/private_ed25519.pem --output dist/<package>.obdresource`:
   - скрипт пересчитает `records`, обновит `manifest.json`, соберёт канонический архив `.obdresource`, вычислит контрольную сумму и подпишет архив, сохранив подпись в `dist/<package>.obdresource.sig`.
4. Провести контрольную проверку: `tools/data-migration/verify_package.py --input dist/<package>.obdresource --signature dist/<package>.obdresource.sig --key keys/public_ed25519.pem`.
5. Перенести итоговый `.obdresource` в подписанный репозиторий и/или передать операторам.

## Следующие действия (Этап 0)
- Использовать шаблон `docs/internal/update-security-meeting-invite.md`, отправить приглашение владельцу инфраструктуры с повесткой `docs/tech/update-security-infra-meeting.md`, провести встречу и зафиксировать задачи в трекере.
- Во время встречи фиксировать решения и риски в `docs/internal/update-security-meeting-notes-template.md`, после — опубликовать протокол и обновить трекер.
- Контролировать подготовку по чек-листу `docs/internal/update-security-meeting-prep-checklist.md`.
- После встречи разослать резюме по шаблону `docs/internal/update-security-meeting-followup-template.md`.
- По итогам созвона заполнить `docs/internal/update-security-meeting-notes-20251015.md` и приложить к follow-up.
- Импортировать задачи из `docs/internal/update-security-boards-backlog.md` в трекер и проставить ссылки в протоколе.
- После утверждения Stage 0 начать Stage 1 по документу `docs/tech/stage1-kiosk-agent-plan.md`.
- Создать задачи Stage 1 по списку `docs/internal/stage1-pass-thru-backlog.md` и синхронизировать с командами.
- Раскатать тестовые задачи из `docs/tech/stage1-test-plan.md` и обеспечить запуск в CI.

## Черновик JNI API для PassThru
| JNI метод | Возвращаемый тип | Вход | Прототип в C++ | Комментарии |
|-----------|------------------|------|----------------|-------------|
| `openAdapter(adapterId: String): Long` | `jlong` | идентификатор DLL/адаптера | `J2534Result openAdapter(const std::string&, ChannelHandle&)` | Возвращает handle устройства, ошибки транслируем в исключение `DiagnosticsException`. |
| `closeAdapter(handle: Long)` | `void` | handle устройства | `J2534Result closeAdapter(DeviceHandle)` | Гарантированно вызывается `finally`; логируем ошибку, но не бросаем повторно. |
| `connectChannel(handle: Long, protocol: Int, baud: Int, flags: Int): Long` | `jlong` | параметры соединения | `J2534Result connectChannel(DeviceHandle, ProtocolConfig&, ChannelHandle&)` | Возвращает handle канала; конфиг переносим из Kotlin в структуру C++. |
| `disconnectChannel(channel: Long)` | `void` | handle канала | `J2534Result disconnectChannel(ChannelHandle)` | Закрываем канал, даже если драйвер уже освободил ресурсы. |
| `setConfig(channel: Long, configs: IntArray, values: IntArray)` | `void` | массивы P* и W* | `J2534Result setConfig(ChannelHandle, const std::vector<SConfig>&)` | Проверяем длину массивов, мапим в `SConfig`. |
| `startMsgFilter(channel: Long, filter: FilterConfig)` | `Long` | структура фильтра | `J2534Result startMsgFilter(ChannelHandle, const FilterConfig&, FilterHandle&)` | Возвращаем ID фильтра для последующей остановки. |
| `stopMsgFilter(channel: Long, filterHandle: Long)` | `void` | handle фильтра | `J2534Result stopMsgFilter(ChannelHandle, FilterHandle)` | Требуется для CAN Sniffer и периодических фильтров. |
| `writeMsgs(channel: Long, frames: Array<ByteArray>, timeoutMs: Int)` | `Int` | кадры | `J2534Result writeMsgs(ChannelHandle, const std::vector<PassThruMsg>&, uint32_t&)` | Возвращаем число реально отправленных сообщений. |
| `readMsgs(channel: Long, maxFrames: Int, timeoutMs: Int): List<ByteArray>` | `jobject` | параметры чтения | `J2534Result readMsgs(ChannelHandle, std::vector<PassThruMsg>&, uint32_t&)` | Возвращаем список байтовых массивов; пустой список при таймауте. |
| `readVersion(handle: Long): VersionInfo` | `jobject` | handle устройства | `J2534Result readVersion(DeviceHandle, VersionInfo&)` | `VersionInfo` включает `dll`, `firmware`, `api`. |
| `getLastError(): String` | `jstring` | — | `const char* getLastError()` | Используем для разработки и расширенной диагностики. |

> В Kotlin каждое JNI-исключение преобразуем в `DiagnosticsException` с кодом и сообщением. В C++ держим `std::mutex` для сериализации вызовов к адаптерам без потокобезопасности.

## План миграции данных из Windows-проекта
1. **DTC и VIN**: Python-скрипт читает CSV/XML из `lib/Protocol/DTC` и `lib/Decoder`, нормализует кодировку, экспортирует в JSON/SQLite. Скрипт размещаем в `tools/data-migration/prepare_resources.py`.
2. **Security Keys**: определить формат, обернуть в зашифрованный контейнер (например, AES-архив); ключ хранить в защищённом хранилище разработчика.
3. **Медиа/иконки**: извлечь из `lib/Media/`, перевести в WebP/VectorDrawable, добавить в `android/app/src/main/res`.
4. **Текстовые подсказки**: собрать строки из `Forms` и `Main` в отдельный каталог, подготовить локализации (ru/en).
5. **Документация**: фиксировать каждую конвертацию в `docs/migrations/windows-to-android.md` для трассировки.

> Скрипт миграции должен быть идемпотентным и вести журнал операций.

## Риски и открытые вопросы Stage 0
- **Лицензия Windows-приложения**: разрешение на использование DTC-справочников получено 12.10.2025; остальные компоненты требуют отдельного согласования при переносе кода.
- **J2534-драйверы на Android**: необходимо решить, какие адаптеры поддерживаем и как будет распространяться DLL/so; возможно, придётся эмулировать PassThru поверх собственного драйвера.
- **Алгоритмы безопасности**: часть seed-key логики может быть специфична для OEM, требуется проверка легальности и актуальности.
- **Размер каталогов DTC**: измеренный объём нормализованных JSON — 2,22 МБ; требуется решить, включаем ли данные в APK или выносим в отдельный пакет/обновление.
- **CAN Sniffer**: определить, нужен ли функционал прослушивания в первой версии Android-приложения или переносим его в отдельный dev-инструмент.

> Эти вопросы необходимо закрыть до перехода к Stage 1 (проектирование архитектуры Android-клиента).

## Переход к Stage 1
1. На основе черновика JNI API и требований UI описать архитектуру модулей `PassThruClient`, `DiagnosticsSessionController`, `UdsScenarioService`.
2. Провести ревью спецификации `PassThruClient` (Kotlin API, модели ошибок, стратегия управления ресурсами) и зафиксировать протокол согласования.
3. Сформировать диаграммы взаимодействия (UI ↔ сервисы ↔ JNI ↔ драйвер), зафиксировать требования к потокам и таймаутам.
4. Определить стратегию тестирования: unit, интеграционные с моками JNI, hardware-in-the-loop; описать ожидания для эмуляторов адаптеров.
5. Синхронизировать план миграции данных с пайплайном сборки Android, дополнить чек-лист Stage 0 переведёнными пунктами.

> После утверждения Stage 1 архитектуры можно приступать к реализации Kotlin/C++ инфраструктуры и интеграции с мигрированными данными.

