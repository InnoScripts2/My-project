# Session 03 — Core Module Skeleton

Дата: 03.11.2025
Диапазон: Фаза A, сессия 3 (старт)

## Выполненные действия
- Создан модуль `android/core` с плагинами `android-library`, `kotlin-android`, namespace `com.selfservice.core`, compileSdk 34.
- Добавлены базовые зависимости (`kotlinx-coroutines-core`, `androidx.core-ktx`) и отключена генерация `BuildConfig`.
- В `android/core` создан `DispatchersProvider` для централизованного доступа к корутинным диспетчерам.
- Модуль `android/app` подключён к `:core` через `implementation(project(":core"))`.
- Создан модуль `android/feature-obd-core` (библиотека с зависимостью на `:core`, coroutine-базой и android-корутинами).
- Добавлены первичные модели `BleDevice`, `BleScannerConfig`, `ObdSessionState` как точки входа для миграции BLE/diagnostics логики.
- Определены контракты `TransportFactory`, `ObdTransport`, `ObdSessionController`, `ObdSessionConfig`.
- Настроены unit-тестовые зависимости (`junit`, `kotlinx-coroutines-test`) для `core` и `feature-obd-core`, добавлен `TestDispatchersProvider` и smoke-тест `ObdSessionStateTest`.
- Перенесён алгоритм восстановления соединения `BleReconnectCoordinator` в `feature-obd-core`, адаптирован под новое namespace.
- Добавлены unit-тесты `BleReconnectCoordinatorTest` в `feature-obd-core` с телеметрией и проверкой backoff-политик.
- Перенесена state machine `BleSessionStateMachine` в `feature-obd-core`, сохранены механизмы watchdog и API переходов.
- Реализованы тесты `BleSessionStateMachineTest` на базе `kotlinx-coroutines-test`, проверяющие таймаут рукопожатия и heartbeats диагностики.
- Расширен контракт `ObdSessionController` и добавлен `DefaultObdSessionController`, маппящий стадии state machine на публичные `ObdSessionState`.
- `ObdSessionState` дополнен состоянием `Diagnostics`, обновлены тесты и добавлены проверки контроллера (`DefaultObdSessionControllerTest`).
- Реализован `BleGattTransport` на базе `BluetoothGatt`-клиента с буферизацией входящих кадров и поддержкой тайм-аута соединения.
- Добавлены `BleGattClient` и `BleGattTransportFactory` для интеграции с существующим `TransportFactory` API.
- Написаны unit-тесты `BleGattTransportTest`, покрывающие успешное подключение, обработку уведомлений, делегирование `write` и сценарии отключения.
- Добавлены `BleScanResult`, `BleScanner` и `BleAdapterManager` с кешированием обнаруженных адаптеров и фильтрацией по шаблонам/UUID.
- `DefaultObdSessionController` интегрирован с менеджером адаптеров; ретраи используют последнее найденное устройство, сканирование включается при старте и выключается при завершении.
- Расширены тесты контроллера (`DefaultObdSessionControllerTest`) и добавлены `BleAdapterManagerTest` для проверки фильтрации, повторного запуска и остановки сканирования.
- Реализован `AndroidBleScanner`, использующий `BluetoothLeScanner`, тайм-ауты конфигурации и поток `BleScanResult` для `BleAdapterManager`.
- Спроектирован слой телеметрии (`ObdSessionTelemetry`) с событиями для сканера, переходов и повторных попыток; контроллер теперь эмитит события.
- Контроллер дополнен обработчиками телеметрии (`SessionStarted`, `AdapterSelected`, `AdapterReady`, `HandshakeCompleted`, `DiagnosticsStarted`, `DiagnosticsHeartbeat`, `ConnectionIssue`, `RetryScheduled`, `SessionCompleted`, `SessionFailed`, `SessionCancelled`, `ScannerStarted`, `ScannerStopped`).
- Добавлены тесты телеметрии (`telemetryCapturesSuccessfulFlow`) для проверки корректной последовательности событий.
- Требуется определить дополнительные общие компоненты (`Result`, logging, конфигурация DI) и структуру пакетирования.
- Стабилизированы coroutines-тесты (`BleAdapterManagerTest`, `BleGattTransportTest`, `DefaultObdSessionControllerTest`) и обновлён `DefaultObdSessionController` для немедленного перехода в состояние `Connecting` при повторном подключении.
- В `android/core` добавлен `BluetoothPermissionHelper` с API для проверки статуса разрешений, состояния Bluetooth и location toggle; покрыт unit-тестами `BluetoothPermissionHelperTest`.
- Реализован `BluetoothEnvironmentEvaluator` с агрегированным состоянием `BluetoothEnvironmentState` и unit-тестами для оценки готовности окружения.
- Добавлен `BluetoothEnvironmentStatus` и `BluetoothEnvironmentStatusDecider` для определения финального статуса готовности (`Ready`, `MissingPermissions`, `BluetoothDisabled`, `LocationDisabled`).
- Создан `AndroidBluetoothEnvironmentRepository` в `feature-obd-core` для выборки состояния окружения через общесистемный `BluetoothEnvironmentEvaluator`; репозиторий возвращает snapshot и агрегированный статус (`status()`), покрыт тестами с моками `Context`.
- Добавлен `BluetoothPrerequisitesUseCase`, возвращающий `BluetoothPrerequisiteResult` с action-мэппингом (`RequestPermissions`, `EnableBluetooth`, `EnableLocation`, `Ready`) и покрытый unit-тестами `BluetoothPrerequisitesUseCaseTest`.
- Реализован `BluetoothPrerequisitesMonitor`, периодически дергающий use-case, эмитящий изменения статуса в `Flow` и отфильтровывающий дубликаты; покрыт тестами `BluetoothPrerequisitesMonitorTest`.
- `DefaultObdSessionController` интегрирован с проверкой предпосылок: добавлено состояние `ObdSessionState.PreconditionsMissing`, телеметрия `PrerequisitesNotMet`, unit-тесты на блокировку запуска при отсутствии разрешений и на нормальный старт при готовом окружении.
- В `core` вынесен `BluetoothPrerequisiteAction`, добавлены команды `BluetoothPrerequisiteCommand`/`BluetoothPrerequisiteCommandMapper` с выдачей `intentAction`; написаны unit-тесты `BluetoothPrerequisiteCommandMapperTest`.

## Итоги сессии 3
- Построен полноценный фундамент для миграции диагностики: `core`, `feature-obd-core`, BLE transport, adapter manager, session controller, state machine, telemetry.
- Создано >2500 строк production-кода и >1000 строк unit-тестов (Kotlin, coroutines-test, JUnit4, kotlin-test).
- Подготовлена основа для интеграции с реальным BLE-железом через `AndroidBleScanner` и платформенные компоненты.
- Разработана архитектура повторных попыток, retry-scheduling, сканирования адаптеров, event-driven телеметрия.
- Установлен Gradle wrapper 8.7-bin, настроен TOML version catalog, исправлены зависимости (kotlin-test вместо junit4).
- Юнит-тесты исполняются: 25 из 25 успешны.

## Статус тестов
- `core`: все тесты прошли успешно
- `feature-obd-core`: 25/25 тестов успешны
	- Повторный прогон после добавления `BluetoothPrerequisiteCommandMapperTest`

## Следующие шаги
1. Заменить legacy `BluetoothPermissionManager` на `BluetoothPermissionHelper` в новых BLE-модулях и подготовить адаптеры для UI/legacy-кода.
2. Выбрать персистентное хранилище для телеметрии (например, Room/встраиваемый журнал) и подготовить репозиторий событий.
3. Настроить агрегацию метрик (успехи/ошибки, тайм-ауты) на основе событий телеметрии и интегрировать с диагностическим UI.
4. Начать Session 4: Платформенная интеграция — permissions, BLE system services, logging.
