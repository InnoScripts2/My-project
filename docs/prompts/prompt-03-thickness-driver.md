# Промпт 3 Толщиномер BLE драйвер

ЦЕЛЬ
Реализовать драйвер для толщиномера ЛКП через BLE GATT профиль. Драйвер обнаруживает устройство, подключается, принимает измерения 40-60 точек кузова в режиме real-time, буферизует данные, обрабатывает разрывы соединения, предоставляет программный интерфейс для верхнего слоя. Никаких симуляций в PROD. DEV mock отключаем флагом.

КОНТЕКСТ
Проект: автосервис самообслуживания с услугой толщиномер ЛКП. Клиент получает устройство из терминала после оплаты, измеряет зоны кузова автомобиля, устройство по BLE передаёт значения микрон агенту, агент собирает данные и генерирует отчёт. Вход: часть анализа 3, BLE_THSensor-master паттерны GATT, ble_monitor-master референс профилей, TFT_eSPI-master идеи (опционально).

ГРАНИЦЫ
Драйвер не знает о REST API, UI, платежах, отчётах. Он предоставляет программный интерфейс для сканирования, подключения, подписки на события измерений. Верхний слой оркестрации использует драйвер через порт DeviceThickness. Драйвер не имеет состояния сессий пользователя, только состояние устройства и измерений.

АРХИТЕКТУРА

МОДУЛЬ apps/kiosk-agent/src/devices/thickness/driver/ThicknessDriver.ts
Класс ThicknessDriver реализует интерфейс DeviceThickness. Конструктор принимает config: scanTimeout, connectionTimeout, measurementTimeout, targetDeviceName или MAC. Методы: init, start, stop, getStatus, disconnect. EventEmitter для событий: device-detected, connected, measurement-received, measurement-complete, disconnected, error. Внутренние методы: scanForDevice, connectToDevice, subscribeToCharacteristics, handleMeasurement, handleDisconnect.

BLE ТРАНСПОРТ apps/kiosk-agent/src/devices/thickness/ble/
Использование npm пакета @abandonware/noble (Windows BLE API) или bleno (Linux BlueZ). Интерфейс BleClient: startScan, stopScan, connect, disconnect, discoverServices, subscribeCharacteristic. Обёртка над noble для изоляции зависимости. Обработка платформенных различий (Windows/Linux).

GATT ПРОФИЛЬ apps/kiosk-agent/src/devices/thickness/gatt/
Определение GATT Service UUID и Characteristics UUID. Пример: Service UUID 0000FFF0-0000-1000-8000-00805F9B34FB (условный, заменить реальным из документации устройства). Characteristics: Measurement 0000FFF1 (read/notify), Control 0000FFF2 (write), Status 0000FFF3 (read). Descriptors: CCCD (Client Characteristic Configuration Descriptor) для включения notify. Формат данных: measurement characteristic возвращает bytes: [zoneId, valueHigh, valueLow]. ZoneId 0-59 для 60 точек. Value 2 bytes unsigned integer микроны.

МОДЕЛЬ ИЗМЕРЕНИЙ apps/kiosk-agent/src/devices/thickness/models/Measurement.ts
Структура: зоны кузова массив ZoneDefinition. ZoneDefinition: zoneId number, zoneName string (капот передний левый, капот передний правый, крыша передняя левая, и т.д.), normMin number 80, normMax number 150 (заводское ЛКП). Измерение MeasurementPoint: zoneId, value микроны, timestamp, isNormal boolean (value >= normMin && value <= normMax). Состояние сессии измерений: measurements array MeasurementPoint, totalZones 40-60, measuredZones count, startTime, endTime optional, status enum (idle, measuring, complete, incomplete).

СКАНИРОВАНИЕ
Метод init(): запуск BLE сканирования. Фильтр по имени устройства или Service UUID. Таймаут 15 секунд. При обнаружении: emit device-detected с deviceInfo (name, MAC, RSSI). Остановка сканирования. Если таймаут без обнаружения: emit error device_not_found. Retry опционально через конфиг.

ПОДКЛЮЧЕНИЕ
Метод connect(deviceId): подключение к устройству по MAC или ID. Таймаут 10 секунд. После подключения: discovery Services и Characteristics. Подписка на Measurement characteristic через CCCD write 0x01. Emit connected. Если таймаут: emit error connection_timeout, retry с backoff.

НАЧАЛО ИЗМЕРЕНИЙ
Метод start(): проверка статуса connected. Отправка команды Start через Control characteristic (write 0x01). Переход в статус measuring. Создание новой сессии measurements с пустым массивом. Emit measurement-started. Таймаут измерения 5 минут (клиент измеряет вручную, может занять время). При таймауте: автоматический stop с пометкой incomplete.

ПОЛУЧЕНИЕ ИЗМЕРЕНИЙ
Подписка на notify Measurement characteristic. Callback на каждое notification: парсинг bytes [zoneId, valueHigh, valueLow]. Вычисление value = (valueHigh << 8) | valueLow. Создание MeasurementPoint: zoneId, value, timestamp Date.now(), isNormal проверка по нормам. Добавление в measurements массив. Emit measurement-received с payload MeasurementPoint. Проверка measuredZones count: если достигнут totalZones, автоматический переход в complete.

ЗАВЕРШЕНИЕ ИЗМЕРЕНИЙ
Метод stop(): отправка команды Stop через Control characteristic (write 0x02). Переход в статус complete. Emit measurement-complete с payload: measurements, measuredZones, totalZones, duration. Расчёт средних по зонам, выявление отклонений (value вне нормы).

ОБРАБОТКА РАЗРЫВА
BLE disconnect event: emit disconnected. Сохранение текущих measurements с пометкой incomplete. Circuit breaker: при N последовательных разрывах (default 3) переход в статус unavailable. Retry политика: автоматическое переподключение с exponential backoff 5s → 10s → 20s, макс 3 попытки. После исчерпания попыток: emit error device_unavailable.

СТАТУСЫ
Enum ThicknessStatus: idle, scanning, connecting, connected, measuring, complete, incomplete, error, unavailable. Getter getStatus(): ThicknessStatus. Переходы: idle → scanning → connecting → connected → measuring → complete/incomplete → idle.

СОБЫТИЯ
EventEmitter: device-detected (payload: deviceInfo), connected, measurement-started, measurement-received (payload: MeasurementPoint), measurement-progress (payload: {measured, total, percent}), measurement-complete (payload: session summary), disconnected, error (payload: Error). Подписка on, отписка off.

ЛОГИРОВАНИЕ
Structured JSON: timestamp, level, message, context (deviceId, zoneId, value, status). Debug: каждое measurement. Info: статусы, подключение/отключение. Error: сбои, таймауты. Correlation ID для сессий.

DEV РЕЖИМ
Флаг process.env.AGENT_ENV === 'DEV'. В DEV: mock BLE транспорт DevBleClient. DevBleClient эмулирует обнаружение устройства, подключение, notify measurements без реального BLE адаптера. Mock measurements: корректная структура [zoneId, valueHigh, valueLow], но без фейковых значений диагностики (либо фиксированные типовые значения 100 микрон для всех зон, либо пустые данные с explicit пометкой mock). DEV не генерирует псевдореальные отклонения. Mock отключаем в PROD.

ЗАВИСИМОСТИ
npm: @abandonware/noble (BLE для Windows/Linux), uuid (для sessionId). TypeScript: strict mode. ESM: import/export.

ТЕСТЫ

ЮНИТ apps/kiosk-agent/src/devices/thickness/driver/__tests__/ThicknessDriver.test.ts
Mock BleClient. Тест init: сканирование → device-detected → connect → подписка. Тест start: команда Start → notify measurements → measurement-received events. Тест stop: команда Stop → measurement-complete. Тест таймаута: 5 минут без completion → автоматический stop incomplete. Тест disconnect: разрыв соединения → emit disconnected → retry reconnect. Тест парсинга: bytes [05, 00, 64] → zoneId 5, value 100. Тест норм: value 100 → isNormal true, value 200 → isNormal false.

ЮНИТ apps/kiosk-agent/src/devices/thickness/models/__tests__/Measurement.test.ts
Тест ZoneDefinition: проверка zoneId, zoneName, нормы. Тест MeasurementPoint: isNormal logic. Тест сессии: добавление measurements, подсчёт measuredZones, статус complete при totalZones достигнут.

ИНТЕГРАЦИЯ apps/kiosk-agent/src/devices/thickness/__tests__/integration.test.ts
Mock BLE устройство или реальный стенд (если доступен). Драйвер инициализирует, подключается, получает 60 измерений, завершает. Проверка событий, данных, статусов. Длительность теста 30 секунд с ускоренными notify (каждые 100ms).

ИНТЕРФЕЙС DEVICETHICKNESS apps/kiosk-agent/src/devices/thickness/DeviceThickness.ts
interface DeviceThickness extends EventEmitter: init(config: ThicknessConfig) Promise void, start() Promise void, stop() Promise void, getStatus() ThicknessStatus, getMeasurements() MeasurementPoint array, disconnect() Promise void.
type ThicknessConfig: scanTimeout number, connectionTimeout number, measurementTimeout number, targetDeviceName string optional, targetMAC string optional, totalZones number default 60.
type MeasurementPoint: zoneId number, zoneName string, value number микроны, timestamp number, isNormal boolean.
enum ThicknessStatus: IDLE, SCANNING, CONNECTING, CONNECTED, MEASURING, COMPLETE, INCOMPLETE, ERROR, UNAVAILABLE.

ДОКУМЕНТАЦИЯ apps/kiosk-agent/src/devices/thickness/README.md
Описание драйвера, BLE GATT профиль, модель измерений, схема зон кузова (diagram или таблица zoneId → zoneName), примеры использования, конфигурация, тестирование, troubleshooting. Диаграмма последовательности: init → scan → connect → subscribe → start → measurements notify → stop.

БАЗА ЗОН apps/kiosk-agent/src/devices/thickness/database/zones.json
JSON массив: [{zoneId: 0, zoneName: "Капот передний левый", normMin: 80, normMax: 150}, ...]. Всего 40-60 зон. Схема кузова: капот (передний левый/правый/центр), крыша (передняя/центральная/задняя левая/правая), двери (передние/задние левые/правые верх/низ), крылья (передние/задние левые/правые), пороги (левые/правые передние/задние), багажник/крышка (левый/правый/центр). Функция getZoneDefinition(zoneId): поиск в базе.

МЕТРИКИ
Prometheus: thickness_sessions_total counter, thickness_measurements_total counter {zoneId}, thickness_session_duration_seconds histogram, thickness_errors_total counter {type}. Регистрация через prom-client.

КОНФИГУРАЦИЯ apps/kiosk-agent/config/thickness.json
{ "scanTimeout": 15000, "connectionTimeout": 10000, "measurementTimeout": 300000, "targetDeviceName": "TH_Sensor", "totalZones": 60, "normMin": 80, "normMax": 150 }
Чтение конфига при инициализации. Валидация.

ОШИБКИ
Кастомные классы: ThicknessConnectionError, ThicknessTimeoutError, ThicknessMeasurementError. Все extends Error. Поля: message, code, details, timestamp. Логирование с stack trace. Возврат rejected Promise.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
Пример 1: инициализация и измерения
import { ThicknessDriver } from './devices/thickness/driver/ThicknessDriver.js';
const driver = new ThicknessDriver({ targetDeviceName: 'TH_Sensor', totalZones: 60 });
driver.on('device-detected', (info) => console.log('Device found:', info.name));
driver.on('connected', () => console.log('Connected'));
driver.on('measurement-received', (point) => console.log(`Zone ${point.zoneId}: ${point.value} µm`));
driver.on('measurement-complete', (summary) => console.log('Complete:', summary.measuredZones, 'zones'));
await driver.init();
await driver.start();
await new Promise(resolve => driver.on('measurement-complete', resolve));
const measurements = driver.getMeasurements();
console.log('Total measurements:', measurements.length);
await driver.disconnect();

Пример 2: обработка разрыва
driver.on('disconnected', () => {
  console.log('Device disconnected, saving partial data...');
  const partial = driver.getMeasurements();
  savePartialData(partial, { status: 'incomplete' });
});

РИСКИ И МИТИГАЦИЯ
Риск: закрытый GATT профиль устройства. Митигация: использование только официального SDK или опубликованных спецификаций. Если протокол закрыт, требуется соглашение с вендором. Риск: BLE доступность на платформе. Митигация: graceful degradation, явные сообщения об отсутствии BLE адаптера. Риск: разрыв соединения во время измерений. Митигация: сохранение partial data, retry подключения. Риск: медленные измерения клиентом. Митигация: таймаут 5 минут, но настраиваемый. Риск: несовместимость GATT (разные версии устройства). Митигация: версионирование протокола, fallback на базовый профиль.

ROADMAP РАСШИРЕНИЯ
Фаза 1: базовый драйвер BLE GATT, 60 зон, real-time notify. Фаза 2: поддержка batch-read (если устройство поддерживает), ускорение измерений. Фаза 3: калибровка устройства, настройка норм по типу ЛКП. Фаза 4: интеграция с другими моделями толщиномеров, универсальный драйвер.

КРИТЕРИИ ACCEPTANCE
Код на TypeScript ESM strict. Интерфейс DeviceThickness реализован. Тесты юнит/интеграция проходят. DEV mock отключаем в PROD. Логирование structured JSON. Метрики Prometheus. Документация README и примеры. База зон загружена. Конфигурация валидируется. Без симуляций реальных данных диагностики. Обработка всех сценариев сбоев (timeout, disconnect, parse error). События корректно emit'ятся. Статусы transitions валидны. Notify подписка работает. GATT профиль корректен. BLE сканирование и подключение стабильны. Линтеры проходят. Commit message: feat(thickness): add BLE driver for thickness gauge with GATT profile.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций проекта. Никаких эмодзи. Code review: explicit errors, async/await, no console.log в PROD. Pre-commit: lint + test.

ИТОГ
По завершении полностью функциональный BLE драйвер для толщиномера ЛКП с GATT профилем, real-time notify измерений 40-60 зон, обработкой разрывов, событиями, логированием, метриками, тестами, документацией, примерами, базой зон, конфигурацией, DEV mock без симуляций данных. Драйвер готов к интеграции в REST API агента и фронтенд (следующий промпт). Код соответствует инструкциям проекта.
