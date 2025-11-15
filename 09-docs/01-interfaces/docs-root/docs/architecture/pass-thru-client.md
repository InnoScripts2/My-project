# Спецификация PassThruClient

## Цель

`PassThruClient` — Kotlin-слой, инкапсулирующий доступ к JNI-обёртке над J2534/виртуальными адаптерами. Класс отвечает за:

- управление жизненным циклом адаптера и диагностических каналов;
- унификацию конфигурации (тайминги, фильтры, параметры шины);
- сериализацию вызовов к JNI и трансляцию исключений в доменные ошибки;
- публикацию событий диагностики (логи, сырой трафик, телеметрия);
- удобную работу сценариев (`DiagnosticsSessionController`, `UdsScenarioService`, `ObdPidService`).

## Обзор слоёв

```text
UI (Compose) ──> DiagnosticsSessionController ──> PassThruClient ──> JNI (C++) ──> J2534 DLL/адаптер
                                          └─> DiagnosticsEventBus
```

## Ключевые сущности

- `PassThruClient` — фасад, предоставляющий методы подключения и обмена сообщениями.
- `PassThruSession` — описывает одно подключение к адаптеру (device handle, metadata, конфигурация).
- `ChannelHandle` — идентификатор активного канала (UDS, OBD-II, CAN Sniffer);
- `Frame` — объект передачи, содержащий `timestamp`, `data`, `protocol`, `flags`.
- `DiagnosticsError` — sealed-класс доменных ошибок (см. ниже).

## Публичный API (Kotlin)

```kotlin
interface PassThruClient {
    suspend fun openAdapter(adapterId: String): PassThruSession
    suspend fun closeAdapter(session: PassThruSession)

    suspend fun connectChannel(
        session: PassThruSession,
        protocol: Protocol,
        baudRate: Int,
        flags: Set<ChannelFlag>,
        configs: List<ConfigParam>
    ): ChannelHandle

    suspend fun disconnectChannel(session: PassThruSession, channel: ChannelHandle)

    suspend fun updateConfig(session: PassThruSession, channel: ChannelHandle, configs: List<ConfigParam>)

    suspend fun startFilter(
        session: PassThruSession,
        channel: ChannelHandle,
        filter: FilterConfig
    ): FilterHandle

    suspend fun stopFilter(session: PassThruSession, channel: ChannelHandle, filter: FilterHandle)

    suspend fun write(
        session: PassThruSession,
        channel: ChannelHandle,
        frames: List<Frame>,
        timeoutMs: Int
    ): Int

    suspend fun read(
        session: PassThruSession,
        channel: ChannelHandle,
        maxFrames: Int,
        timeoutMs: Int
    ): List<Frame>

    suspend fun readVersion(session: PassThruSession): VersionInfo

    fun diagnosticsEvents(): Flow<DiagnosticsEvent>
}
```

### Поддерживающие типы

- `Protocol` — enum (`CAN`, `ISO15765`, `ISO14230`, `J1850PWM`, и т. д.).
- `ChannelFlag` — bitmask (loopback, ISO15765_PAD, SCI).
- `ConfigParam` — data class `{ id: ConfigId, value: Int }`.
- `FilterConfig` — data class `{ type: FilterType, mask: ByteArray, pattern: ByteArray, flow: ByteArray? }`.
- `Frame` — data class `{ protocol: Protocol, payload: ByteArray, timestamp: Instant, flags: FrameFlag }`.
- `DiagnosticsEvent` — sealed class (state changes, warnings, raw frames, metric updates).

## Ошибки

```kotlin
sealed interface DiagnosticsError {
    data class AdapterNotFound(val adapterId: String) : DiagnosticsError
    data class ChannelNotConnected(val channel: ChannelHandle) : DiagnosticsError
    data class InvalidConfig(val reason: String) : DiagnosticsError
    data class IoFailure(val code: Int, val message: String) : DiagnosticsError
    data class Timeout(val operation: String, val timeoutMs: Int) : DiagnosticsError
    data class PermissionDenied(val hint: String) : DiagnosticsError
}
```

- Все JNI-исключения мапятся в один из вариантов `DiagnosticsError`.
- Метод `diagnosticsEvents` публикует ошибки как `DiagnosticsEvent.Error` для UI/логов.

## Конкурентность

- Все публичные методы `suspend` и выполняются в `Dispatchers.IO`.
- Внутри клиента используется `Mutex` для сериализации вызовов к JNI.
- Отдельный корутинный scope ведёт фоновое чтение каналов (поток CAN Sniffer), результаты публикуются через `Flow`.

## Управление ресурсами

- `PassThruSession` хранит `deviceHandle` и список активных каналов.
- `closeAdapter` закрывает все фильтры и каналы, затем вызывает JNI `closeAdapter`.
- В случае исключения выполняется повторное закрытие (best-effort), результаты логируются.
- Поддерживается авто-таймаут бездействия: если за `idleTimeout` нет активных каналов, выполняется авто-отключение адаптера.

## Логирование

- Все операции логируются через `DiagnosticsEvent.Log`.
- Поддерживается флаг `captureRawFrames`: при включении в поток событий отправляются отправленные и принятые кадры (hex + timestamp).

## Интеграция с Python-лояутом

- После успешного чтения DTC события публикуются с указанием пути к выгруженным JSON (результат работы `prepare_resources.py`).
- PassThruClient предоставляет вспомогательный метод `resolveDtcCatalog(brand: String)` для получения ссылок на локальные каталоги.

## Требования к тестированию

- Юнит-тесты: мок JNI-обёртки, проверка трансляции ошибок, управление ресурсами.
- Интеграционные тесты: запускаемый через инструментальный тест стенд с виртуальным адаптером (loopback).
- Hardware-in-the-loop: сценарии чтения/очистки DTC, последовательности UDS, CAN Sniffer с реальным адаптером.

## Метрики

- `pass_thru_sessions_opened_total`
- `pass_thru_channels_active`
- `pass_thru_operation_duration_ms` (histogram по типам операций)
- `pass_thru_errors_total` (по виду `DiagnosticsError`)

## Открытые вопросы

- Требуется определить стратегию загрузки внешних DLL/so (из APK, из обновлений, через поставщика адаптера).
- Как хранить креденшелы/seed-key таблицы (Android Keystore, зашифрованные файлы).
- Нужна ли поддержка нескольких адаптеров одновременно (многоканальная диагностика).
