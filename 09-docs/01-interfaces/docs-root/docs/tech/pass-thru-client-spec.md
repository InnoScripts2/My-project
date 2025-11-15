# PassThruClient — черновик спецификации

## 1. Цель и область применения

- Слой Kotlin, управляющий диагностическими сессиями поверх JNI к J2534-подсистеме.
- Инкапсулирует выбор адаптера, управление каналами, очередями сообщений и обработку ошибок.
- Предоставляет UI и сервисам единый API без прямой работы с JNI/Native.

## 2. Роли и границы

- **PassThruClient** — фасад, отвечающий за жизненный цикл адаптера и каналов.
- **PassThruTransport** — интерфейс для JNI-обёртки (`openAdapter`, `connectChannel`, `write`, `read`, `ioctl`).
- **SessionPolicy** — набор ограничений (таймауты, попытки переподключения, ограничения по протоколу), задаётся сценариями.
- **DiagnosticsSessionController** — потребитель PassThruClient (вне рамок спецификации, но фиксируется как основной клиент).

## 3. Публичный API (предложение)

| Метод | Назначение | Возврат/исключения |
|-------|------------|--------------------|
| `suspend fun open(adapterId: String, opts: AdapterOptions): AdapterHandle` | Инициализация адаптера | `DiagnosticsException` c кодами `ADAPTER_UNAVAILABLE`, `SECURITY_ERROR`, `TIMEOUT` |
| `suspend fun close()` | Закрытие активного адаптера | Игнорирует повторные вызовы, логирует ошибки |
| `suspend fun establishChannel(request: ChannelRequest): ChannelHandle` | Создаёт диагностический канал (один активный канал на Stage 1) | `DiagnosticsException` (`CHANNEL_BUSY`, `UNSUPPORTED_PROTOCOL`) |
| `suspend fun releaseChannel(handle: ChannelHandle)` | Освобождает канал | Без исключений, ошибки в лог |
| `suspend fun send(frames: List<Frame>, timeout: Duration): SendResult` | Отправка сообщений | Возвращает фактическое число кадров, отрицательные ответы упаковываются в `SendResult.Status` |
| `suspend fun receive(maxFrames: Int, timeout: Duration): ReceiveResult` | Чтение сообщений | Таймаут даёт `ReceiveResult.Empty` |
| `suspend fun setConfig(channel: ChannelHandle, configs: List<ConfigOption>)` | Прокидывает `SET_CONFIG` | `DiagnosticsException` (`INVALID_CONFIG`) |
| `suspend fun readBatteryState(): BatteryStatus` | Обёртка над `READ_VBATT` | `DiagnosticsException` |
| `suspend fun clearDtc(channel: ChannelHandle, strategy: ClearStrategy)` | Высокоуровневая операция (цепочка write/read) | Возвращает `ClearResult` |

## 4. Управление состоянием

- PassThruClient находится в одном из состояний: `Idle`, `AdapterOpen`, `ChannelEstablished`.
- Разрешён только один активный канал на данной итерации Stage 1; расширение до нескольких каналов планируется позже.
- Переходы фиксируются в журнале (`agent.log`), ошибки состояния -> `IllegalStateException` (bug).

## 5. Многопоточность и корутины

- Все публичные методы `suspend`, выполняются в `Dispatchers.IO`.
- Внутренние вызовы JNI сериализуются через `Mutex`, поскольку драйверы J2534 не потокобезопасны.
- Таймауты реализуются через `withTimeout`; превышение таймаута переводит исключение в `DiagnosticsException` с кодом `TIMEOUT`.

## 6. Модель ошибок

- `DiagnosticsException` с полями `code`, `message`, `cause`.
- Коды (черновик): `ADAPTER_UNAVAILABLE`, `CHANNEL_BUSY`, `TIMEOUT`, `NEGATIVE_RESPONSE`, `TRANSPORT_ERROR`, `SECURITY_ERROR`, `UNSUPPORTED_PROTOCOL`, `INVALID_CONFIG`, `SHUTTING_DOWN`.
- JNI-ошибки переводятся по таблице соответствия (будет подготовлена отдельно).

## 7. Телеметрия и аудит

- Метрики Prometheus (через агент): `pass_thru_open_total`, `pass_thru_channel_active`, `pass_thru_send_errors_total`.
- Журналирует каждую операцию уровня INFO (успех) и WARN/ERROR (ошибка) с привязкой `sessionId`.
- Поддерживает `debugTrace` режим для сценариев QA (логирует сырой CAN/UDS).

## 8. Зависимости и интеграции

- Использует `DiagnosticsClock` для детерминированного измерения таймаутов.
- Хранит конфигурацию в `DiagnosticsPreferences` (протокол по умолчанию, maxRetries).
- Для моков в тестах — интерфейс `PassThruTransport` заменяется fake-реализацией.

## 9. Stage 1 ограничения и решения

- **Каналы**: поддерживается один активный диагностический канал. Нарушение ограничения приводит к `DiagnosticsException` с кодом `CHANNEL_BUSY`; расширение до нескольких каналов запланировано на Stage 2.
- **Периодические сообщения**: API `StartPeriodicMsg/StopPeriodicMsg` отложены до Stage 2. В Stage 1 heartbeat реализуется на уровне сервиса (`SessionHeartbeatComponent`) с использованием `send/receive`.
- **Повторное подключение адаптера**: в Stage 1 выполняется вручную через UI. Автовосстановление будет разработано после интеграции мониторинга USB.
- **CAN sniffer**: потоковое чтение реализуется отдельным потребителем (`CanSnifferService`) с подпиской на `receive` + очередь в памяти; API PassThruClient остаётся универсальным.

> Черновик согласован на Stage 0. Переход к Stage 1 подразумевает фиксацию контракта и обновление `docs/windows-app-analysis.md`.
