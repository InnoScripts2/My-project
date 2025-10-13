# Процедура обновления пакетов `.obdresource`

Документ предназначен для операторов, собирающих диагностические каталоги и VIN-данные для Android-киоска.

## Предварительные требования
- Windows 10/11 с PowerShell 7 (pwsh).
- Python 3.11+ (используется `tools/data-migration/prepare_resources.py`).
- Доступ к репозиторию с исходными данными `блок 4/lib/Protocol/DTC/` и `блок 4/lib/Decoder/`.
- Каталог `dist/` доступен для публикации итоговых пакетов.

## Шаг 1. Подготовка JSON-ресурсов
1. Выполнить скрипт нормализации:
   ```powershell
   pwsh -NoProfile -Command "python tools/data-migration/prepare_resources.py --dtc 'блок 4/lib/Protocol/DTC' --decoder 'блок 4/lib/Decoder' --output 'tmp-emulator-test/migration-output'"
   ```
2. Убедиться, что команда завершилась без ошибок. В консоли отобразится путь и JSON-манифест.
3. Проверить файл `tmp-emulator-test/migration-output/manifest.json`:
   - Количество элементов массива `dtc_catalogs` должно совпадать с числом исходных DTC-файлов (ожидаем 31).
   - Каждый элемент содержит `brand`, `output`, `records`, `sha256`.
4. Проверить `tmp-emulator-test/migration-output/vin_manifest.json` (содержит `VIN_DECODER.cs` и `README.md`).

## Шаг 2. Формирование каталога пакета
1. Для каждого бренда создать директорию `build/dtc-package/<brand>/`.
2. Скопировать готовые JSON-файлы:
   - Источник: `tmp-emulator-test/migration-output/dtc/dtc_<BRAND>.json`.
   - Назначение: `build/dtc-package/<brand>/data/`.
3. Собрать лицензионные материалы:
   - Использовать исходные Markdown/текстовые файлы из `блок 4/lib/Protocol/DTC/` (например, `LandRoverDTC.md`).
   - Добавить агрегированные уведомления (`COPYRIGHT-BenjaminJackLeighton.txt`, `LICENSE-DarkUIReborn.txt`, `LICENSE-J2534-Sharp.txt`) в каждый пакет.
   - Разместить копии в `build/dtc-package/<brand>/licenses/`.
4. Сформировать `manifest.json` по шаблону:
   ```json
   {
     "appMinVersion": "1.0.0",
     "packageId": "dtc.<brand>.YYYY.qX-dev",
     "version": "YYYY.MM.1",
     "records": <сумма записей из соответствующих JSON>,
     "createdAtUtc": "<ISO-время>",
     "checksum": "<sha256 итогового .obdresource>",
     "keyId": "primary",
     "notes": "<краткое описание содержимого>"
   }
   ```
   Значения `records` и `notes` берутся из `manifest.json`, сформированного скриптом (см. поле `records` и `source`).

## Шаг 3. Упаковка `.obdresource`
1. Убедиться, что структура внутри `build/dtc-package/<brand>/` включает подпапки `data/`, `licenses/`, файл `manifest.json`.
2. Выполнить упаковку в архив (zip) с расширением `.obdresource`:
   ```powershell
   Compress-Archive -Path "build/dtc-package/<brand>/*" -DestinationPath "dist/dtc.<brand>.YYYY.qX-dev.obdresource" -Force
   ```
3. Вычислить SHA-256 архива и перенести значение в поле `checksum` манифеста:
   ```powershell
   (Get-FileHash "dist/dtc.<brand>.YYYY.qX-dev.obdresource" -Algorithm SHA256).Hash
   ```
4. Сохранить контрольную сумму в отдельном файле `dist/dtc.<brand>.YYYY.qX-dev.obdresource.sha256`.
5. При необходимости сгенерировать подпись (`.sig`) согласно политике безопасности (скрипт подписания определяется отделом безопасности; шаг зафиксирован, но инструмент в репозитории отсутствует).

## Шаг 4. Верификация и публикация
1. Распаковать архив в временную директорию и убедиться, что JSON-файлы читаются и совпадают с оригиналом.
2. Проверить, что значения `records` в `manifest.json` совпадают с количеством элементов в каждом JSON.
3. Убедиться, что в `licenses/` присутствуют все требуемые уведомления (оригинальные DTC-файлы + агрегированные лицензии).
4. Передать `dist/*.obdresource` и `.sha256` в систему распространения. Подписи (`.sig`) при наличии также выкладываются.
5. Зафиксировать выпуск в журнале изменений (`docs/history.md`).

## Обновление VIN-данных
- `vin_manifest.json` копируется в пакет агента; при изменениях контролируем хэш.
- При необходимости создания отдельного VIN-пакета используется аналогичная схема (`build/vin-package/<...>`), в текущем релизе достаточно хранить манифест рядом с DTC.

## Частота обновления
- Регламент: не реже одного раза в квартал или при поступлении новых каталогов от производителей.
- После каждого обновления проводить smoke-тест импортера (`npm --prefix apps-unified/kiosk-agent test -- src/dtc/importer.test.ts`).
