# Задания для фоновых ИИ-агентов (OBD диагностика)

Ниже представлены пять независимых промптов. Каждый промпт охватывает уникальный набор файлов и прямо запрещает задевать области, зарезервированные другими заданиями, а также `index.tsx` и `package.json` любого проекта.

## Промпт 1 — BLE транспорт ELM
```
Тебе поручено доработать BLE-транспорт ELM.
Работай исключительно с файлами:
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/data/BleElmTransport.kt
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/connection/BleGattConnection.kt

Цели:
- подключи вызов BleGattConnection.write к sendCommand;
- оформи обработку уведомлений через BleGattConnection.registerNotificationListener;
- унифицируй нормализацию ответов, применяя ElmResponseParser.normalizeResponse до публикации результата;
- добавь диагностическое логирование ошибок.

Строго НЕ изменяй другие файлы, в частности материалы из промптов 2–5, а также любые `index.tsx` и `package.json`.
```

## Промпт 2 — SPP транспорт ELM
```
Настрой классический SPP-транспорт ELM.
Используй только файлы:
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/data/SppElmTransport.kt
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/connection/ClassicSppConnection.kt

Задачи:
- унифицируй чтение и нормализацию ответов с логикой BLE (см. ElmResponseParser.normalizeResponse);
- реализуй буферизацию входящих данных с учётом тайм-аутов;
- обеспечь публикацию всех ответов через getResponses().

Не трогай файлы, указанные в промптах 1, 3, 4, 5, а также любые `index.tsx` или `package.json`.
```

## Промпт 3 — ElmCommandHandler и очередь команд
```
Сфокусируйся на обработчике команд ELM.
Разрешённые файлы:
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/data/ElmCommandHandler.kt
- apps-unified/android-kiosk/app/src/main/java/com/selfservice/kiosk/bluetooth/data/ElmTransport.kt

Что сделать:
- внедри очередь команд с ограничением параллелизма (по одной команде за раз);
- добавь повторную отправку для критичных команд (ATZ, 03, 04) с конфигурируемыми тайм-аутами;
- расширь интерфейс ElmTransport, чтобы возвращать структурированные результаты (raw + normalized).

Не модифицируй файлы из промптов 1, 2, 4, 5 и не прикасайся к `index.tsx` / `package.json`.
```

## Промпт 4 — Связка с diagnostics-core
```
Нужно создать связующий слой между Android-модулем и diagnostics-core.
Работай только с файлами:
- apps-unified/android-kiosk/diagnostics-core/src/main/java/com/selfservice/kiosk/diagnostics/session/DiagnosticsSessionController.kt
- apps-unified/android-kiosk/diagnostics-core/src/main/java/com/selfservice/kiosk/diagnostics/passthru/PassThruClient.kt
- apps-unified/android-kiosk/diagnostics-core/src/main/java/com/selfservice/kiosk/diagnostics/passthru/PassThruTransport.kt

Цели:
- добавить адаптер, принимающий ElmTransport и транслирующий его в PassThruTransport;
- реализовать базовые тестовые заглушки подключения и очистки DTC (при необходимости создай новые файлы тестов внутри diagnostics-core/src/test/...);
- обновить DiagnosticsSessionController для работы с новым адаптером.

Запрещено изменять файлы, перечисленные в промптах 1, 2, 3, 5, а также любые `index.tsx` и `package.json`.
```

## Промпт 5 — Документация и чек-листы
```
Обнови документацию по процессу диагностики.
Используй файлы:
- docs/internal/repo-refactor-stage2.md
- docs/internal/inventory/stage0-inventory.md
- docs/internal/troubleshooting/obd-workflow.md (создай файл, если отсутствует)

Задачи:
- зафиксируй новые этапы интеграции BLE/SPP, диагностики и связки с diagnostics-core;
- внеси актуальные требования DEV/PROD в stage0-inventory;
- подготовь раздел troubleshooting с типовыми ошибками подключения.

Не правь файлы из промптов 1–4, а также не трогай никакие `index.tsx` и `package.json`.
```