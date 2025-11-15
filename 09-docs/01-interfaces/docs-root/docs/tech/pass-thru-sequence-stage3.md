# PassThru последовательности Stage 3

## Сценарий 1 — Подключение адаптера

1. UI `ConnectScreen` получает список устройств через `DiagnosticsSessionController.listAdapters()`.
2. Kotlin вызывает `PassThruClient.openAdapter(adapterId)` → JNI `openAdapter` → C++ загрузка DLL и `PassThruOpen`.
3. При успехе `DiagnosticsSessionController` сохраняет `deviceHandle`, запрашивает версии (`readVersion`) и обновляет UI.
4. В случае ошибки JNI выбрасывает исключение, контроллер логирует событие и показывает пользователю код ошибки.

## Сценарий 2 — Установка канала и чтение DTC

1. Клиент выбирает протокол, UI вызывает `DiagnosticsSessionController.startSession(protocolConfig)`.
2. Контроллер вызывает `PassThruClient.connectChannel(deviceHandle, protocolConfig)` → JNI `connectChannel` → C++ `PassThruConnect` + `setConfig`.
3. После установления канала контроллер запускает `DiagnosticsSession` и планирует heartbeat `Tester Present`.
4. Для чтения DTC Kotlin формирует кадр `ReadDtcRequest`, передаёт в `PassThruClient.writeFrames(channel, frames)` → JNI `writeMsgs` → C++ `PassThruWriteMsgs`.
5. Контроллер вызывает `PassThruClient.readFrames(channel, timeout)` для получения ответа, парсит кадры и обращается к `DtcRepository` (SQLite ← `.obdresource`).
6. Результат отображается в UI и логируется (`diagnostics.log.jsonl`).

## Сценарий 3 — Tester Present

1. `DiagnosticsSessionController` запускает coroutine с интервалом, указанным в конфиге (по умолчанию 2,5 секунды).
2. Каждый тик вызывает `PassThruClient.writeFrames(channel, testerPresentFrame)` без ожидания ответа.
3. При возникновении ошибки (например, `ERR_TIMEOUT`) контроллер инициирует процедуру восстановления: повторная отправка, затем попытка переподключения канала.
4. После трёх неудач контроллер уведомляет UI и переводит сессию в состояние `Disconnected`.

## Сценарий 4 — Очистка DTC

1. Пользователь подтверждает операцию, UI вызывает `DiagnosticsSessionController.clearDtc()`.
2. Контроллер формирует команду `ClearDtcRequest`, вызывает `PassThruClient.writeFrames` и ожидает ответ через `readFrames`.
3. При получении положительного ответа обновляет журнал событий и запускает повторное чтение DTC для подтверждения.
4. Если приходит негативный ответ `0x7F`, контроллер отображает код отказа и предлагает повторить с другой диагностической сессией.

## Сценарий 5 — CAN Sniffer (dev-профиль)

1. UI включает режим Sniffer, контроллер создаёт отдельный поток чтения `PassThruClient.startSniffer(channel, filterConfig)`.
2. JNI вызывает C++ функцию, которая устанавливает фильтр (`PassThruStartMsgFilter`) и читает сообщения в отдельном worker-потоке.
3. Каждая порция кадров отправляется в Kotlin через callback, затем агрегируется и отображается в UI.
4. При остановке Sniffer контроллер вызывает `PassThruClient.stopSniffer` и `PassThruStopMsgFilter`, снимает таймеры и освобождает ресурсы.

## Сценарий 6 — Завершение сеанса

1. Пользователь нажимает «Отключить», контроллер останавливает heartbeat и sniffer.
2. Контроллер вызывает `PassThruClient.disconnectChannel(channel)` → JNI `disconnectChannel` → C++ `PassThruDisconnect`.
3. Затем выполняется `PassThruClient.closeAdapter(deviceHandle)` и освобождаются все JNI ресурсы.
4. `DiagnosticsSessionController` закрывает SQLite курсоры, финализирует лог (добавляет запись `session_end`).
5. UI возвращается на экран подключения, предлагая повторный выбор адаптера.
