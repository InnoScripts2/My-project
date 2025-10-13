# Промпт 1 OBD-II драйвер низкого уровня

ЦЕЛЬ
Реализовать низкоуровневый драйвер для OBD-II адаптеров ELM327 поверх Serial/Bluetooth транспорта. Драйвер отвечает за инициализацию адаптера, отправку команд AT и OBD, парсинг ответов, обработку таймаутов и восстановление соединения. Никаких симуляций в PROD режиме. DEV заглушки отключаемы флагом.

КОНТЕКСТ
Проект: автосервис самообслуживания с диагностикой OBD-II. Агент на Node.js TypeScript ESM управляет устройствами локально. Клиент подключает адаптер к разъёму OBD-II автомобиля, агент запускает сканирование DTC, чтение PID, очистку DTC. Вход: часть анализа 2, node-bluetooth-obd-master таблицы PID и паттерны, node-obd2-master парсеры DTC, ecu-simulator-master для тестов.

ГРАНИЦЫ
Драйвер не знает о REST/WebSocket API, UI, платежах, отчётах. Он предоставляет программный интерфейс для инициализации, отправки команд, подписки на события. Верхний слой оркестрации использует драйвер через порт DeviceObd. Драйвер не имеет состояния сессий пользователя, только состояние адаптера и протокола.

АРХИТЕКТУРА

МОДУЛЬ apps/kiosk-agent/src/devices/obd/driver/Elm327Driver.ts
Класс Elm327Driver реализует интерфейс DeviceObd. Конструктор принимает config: транспорт (serial/bluetooth), порт, baudrate, таймауты, лимиты повторов. Методы: init, readDtc, clearDtc, readPid, disconnect. EventEmitter для событий: connected, disconnected, error, timeout. Внутренние методы: sendCommand, parseResponse, handleTimeout, reconnect.

ТРАНСПОРТ apps/kiosk-agent/src/devices/obd/transport/
Интерфейс Transport: open, close, write, read, on(data/error/close). Реализации: SerialTransport (serialport npm), BluetoothTransport (bluetooth-serial-port или @abandonware/noble). Транспорт открывает порт/соединение, отправляет строки команд с CR, читает ответы построчно. Обработка буферизации и фрагментации.

КОМАНДЫ apps/kiosk-agent/src/devices/obd/commands/
Константы команд: ATZ (reset), ATE0 (echo off), ATL0 (linefeed off), ATS0 (spaces off), ATH0 (headers off), ATSP0 (auto protocol), 0100 (supported PIDs 01-20), 0120 (PIDs 21-40), 0140 (PIDs 41-60), 0160 (PIDs 61-80), 03 (read DTC), 04 (clear DTC), 02 00 (freeze frame 00), 01 XX (PID read mode 01), 09 XX (vehicle info mode 09). Таймауты по команде: AT* 1000ms, 01XX/03/04 5000ms, 02XX 3000ms. Retry логика: 3 попытки с backoff 500ms → 1000ms → 2000ms.

ПАРСИНГ apps/kiosk-agent/src/devices/obd/parsers/
Функции parseDtc(response), parsePid(pid, response), parseFreezeFrame(response). DTC парсинг: входная строка hex байты, 2 байта на код. Первый байт маска категории: 0x00-0x3F P-коды (powertrain), 0x40-0x7F C-коды (chassis), 0x80-0xBF B-коды (body), 0xC0-0xFF U-коды (network). Второй байт: первая цифра, остальные биты вторая-третья-четвертая цифры. Пример: 43 01 33 00 44 00 00 00 → P0133, P0044. Количество кодов в первом байте ответа. PID парсинг: таблицы формул из node-bluetooth-obd-master. PID 0C (RPM): ((A*256)+B)/4. PID 0D (Speed): A km/h. PID 05 (Coolant): A-40 C. PID 0F (Intake temp): A-40 C. PID 11 (Throttle): A*100/255 %. Возвращать объект: pid, value, unit, rawBytes. Ошибки парсинга: выбрасывать ParseError с сырым фреймом.

ТАЙМАУТЫ И ОЧЕРЕДЬ
Каждая команда имеет таймаут. При отправке команды стартовать таймер. Ответ отменяет таймер. Истечение таймаута: emit timeout event, инкремент счётчика retry, retry до лимита. После лимита: emit error. Очередь команд: FIFO с приоритетами (высокий: init, средний: read, низкий: clear). Ограничение параллелизма 1: только одна активная команда. Новые команды в очередь.

ИНИЦИАЛИЗАЦИЯ
Метод init(): open transport → wait 500ms → ATZ → wait 1000ms → ATE0 ATL0 ATS0 ATH0 ATSP0 → 0100 для списка поддерживаемых PID. Сохранить список PID в состоянии драйвера. Emit connected event при успехе. Emit error при сбое на любом шаге. Логировать каждый шаг. Переход в статус ready.

ЧТЕНИЕ DTC
Метод readDtc(): проверка статуса ready. Отправка 03. Парсинг ответа через parseDtc. Возврат массива DtcEntry: code, category, description (optional из базы), rawBytes. Если DTC нет: ответ 43 00 00 00 00 00 00 → пустой массив. Логировать количество кодов.

ОЧИСТКА DTC
Метод clearDtc(): проверка статуса ready. Требует явное подтверждение из вызывающего кода. Отправка 04. Ответ 44 00 00 00 00 00 00 → успех. Логировать операцию с timestamp и результатом. Emit dtc-cleared event. Возврат boolean success.

ЧТЕНИЕ PID
Метод readPid(pid: string): проверка статуса ready и поддержки PID. Отправка 01 {pid}. Парсинг через parsePid. Возврат объекта PidValue. Emit pid-read event. Частота опроса: не чаще 1–5 Гц. Буферизация если запросы чаще лимита.

СБОИ И ВОССТАНОВЛЕНИЕ
Потеря соединения: transport emit close event → драйвер emit disconnected → попытка reconnect через 5s → exponential backoff до 60s max → N попыток (default 3). После исчерпания попыток: переход в статус unavailable. Неверный формат ответа: emit parse_error с сырыми данными → retry команды. NO DATA ответ: возможно команда не поддерживается → emit unsupported → fallback. Таймаут без ответа: retry → emit timeout → после лимита emit error и переход в idle.

СТАТУСЫ
Перечисление ObdStatus: disconnected, connecting, initializing, ready, scanning, idle, error, unavailable. Getter getStatus(): ObdStatus. Переходы: disconnected → connecting → initializing → ready → idle ↔ scanning. При ошибке: любой статус → error → idle или unavailable.

СОБЫТИЯ
EventEmitter: connected, disconnected, dtc-read (payload: DtcEntry[]), dtc-cleared (payload: boolean), pid-read (payload: PidValue), error (payload: Error), timeout (payload: command), status-change (payload: ObdStatus). Подписка через on(event, handler). Отписка off(event, handler).

ЛОГИРОВАНИЕ
Каждая команда и ответ: debug level. Ошибки и таймауты: error level. Статусные переходы: info level. Формат JSON structured: timestamp, level, message, context (command, response, status, attempt). Correlation ID для сессий.

DEV РЕЖИМ
Флаг process.env.AGENT_ENV === 'DEV'. В DEV: mock transport доступен через DevTransport класс. DevTransport эмулирует ответы на команды без реального устройства. Ответы: ATZ → ELM327 v1.5, ATE0 → OK, 0100 → 41 00 FF FF FF FF (все PID поддерживаются), 03 → 43 01 33 00 44 00 00 00 (2 кода), 04 → 44 00 00 00 00 00 00. DEV не генерирует фейковые данные диагностики, только корректные структуры ответов. Mock отключаем в PROD через tree-shaking или проверку AGENT_ENV.

ЗАВИСИМОСТИ
npm: serialport (Serial), @abandonware/noble или bluetooth-serial-port (Bluetooth), eventemitter3 (события). TypeScript: strict mode, explicit types. ESM: import/export.

ТЕСТЫ

ЮНИТ apps/kiosk-agent/src/devices/obd/driver/__tests__/Elm327Driver.test.ts
Тест инициализации: mock transport → init → проверка последовательности команд → emit connected. Тест readDtc: mock ответ 43 01 33 00 44 00 00 00 → парсинг P0133, P0044. Тест clearDtc: mock ответ 44 00 00 00 00 00 00 → success true. Тест readPid: mock ответ 41 0C 1A F8 → RPM 1726. Тест таймаута: no response → retry → emit timeout → error. Тест parse error: invalid response → emit parse_error → retry. Тест reconnect: disconnect → auto-reconnect → exponential backoff.

ЮНИТ apps/kiosk-agent/src/devices/obd/parsers/__tests__/parseDtc.test.ts
Входы: 43 01 33 00 44 00 00 00, 43 00 00 00 00 00 00, 43 02 12 34 56 78 00 00. Проверка: количество кодов, категории P/C/B/U, формат кодов.

ЮНИТ apps/kiosk-agent/src/devices/obd/parsers/__tests__/parsePid.test.ts
Входы PID 0C: 41 0C 1A F8 → RPM 1726. PID 0D: 41 0D 50 → Speed 80 km/h. PID 05: 41 05 64 → Coolant 60 C. Проверка формул, единиц.

ИНТЕГРАЦИЯ apps/kiosk-agent/src/devices/obd/__tests__/integration.test.ts
ecu-simulator-master как mock ECU. Драйвер подключается к симулятору. Последовательность: init → readDtc → clearDtc → readPid 0C/0D/05. Проверка событий и данных. Длительность теста 2 минуты с периодическим опросом PID.

НАГРУЗОЧНЫЕ apps/kiosk-agent/src/devices/obd/__tests__/stress.test.ts
10 минут опроса PID 0C/0D каждые 500ms. Проверка стабильности, отсутствия утечек памяти, корректность retry при сбоях. Симуляция разрыва соединения и восстановления.

ИНТЕРФЕЙС DEVICEOBD apps/kiosk-agent/src/devices/obd/DeviceObd.ts
interface DeviceObd extends EventEmitter: init(config: ObdConfig) Promise void, readDtc() Promise DtcEntry array, clearDtc() Promise boolean, readPid(pid: string) Promise PidValue, getStatus() ObdStatus, disconnect() Promise void.
type ObdConfig: transport serial or bluetooth, port string, baudrate number optional, timeout number optional, retries number optional.
type DtcEntry: code string, category P or C or B or U, description string optional, rawBytes string.
type PidValue: pid string, value number, unit string, rawBytes string, timestamp number.
enum ObdStatus: DISCONNECTED, CONNECTING, INITIALIZING, READY, SCANNING, IDLE, ERROR, UNAVAILABLE

ДОКУМЕНТАЦИЯ apps/kiosk-agent/src/devices/obd/README.md
Описание драйвера, архитектура, список команд, форматы ответов, примеры использования, конфигурация, тестирование, troubleshooting. Таблица PID с формулами. Таблица DTC категорий. Диаграмма последовательности init → scan → clear.

БАЗА ДАННЫХ DTC apps/kiosk-agent/src/devices/obd/database/dtc-codes.json
JSON файл: массив объектов { code, category, description }. Источники: открытые базы SAE J2012, ISO 15031. Не копировать закрытые базы. Для неизвестных кодов: description undefined. Функция getDtcDescription(code): поиск в базе.

МЕТРИКИ
Prometheus: obd_connections_total counter, obd_dtc_read_total counter, obd_dtc_cleared_total counter, obd_pid_read_total counter {pid}, obd_errors_total counter {type}, obd_command_duration_seconds histogram {command}. Регистрация через prom-client. Экспорт в /metrics эндпойнт (не часть драйвера, но агрегация метрик).

КОНФИГУРАЦИЯ apps/kiosk-agent/config/obd.json
{ "transport": "serial", "port": "COM3", "baudrate": 38400, "timeout": 5000, "retries": 3, "reconnectDelay": 5000, "reconnectAttempts": 3, "pidPollRate": 1000, "supportedPids": ["0C", "0D", "05", "0F", "11"] }
Чтение конфига при инициализации драйвера. Валидация параметров. Defaults если параметры не указаны.

ОШИБКИ
Кастомные классы: ObdConnectionError, ObdTimeoutError, ObdParseError, ObdUnsupportedError. Все extends Error. Поля: message, code, details, timestamp. Логирование с stack trace. Не выбрасывать ошибки синхронно, возвращать rejected Promise.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
Пример 1: инициализация и чтение DTC
import { Elm327Driver } from './devices/obd/driver/Elm327Driver.js';
const driver = new Elm327Driver({ transport: 'serial', port: 'COM3' });
driver.on('connected', () => console.log('OBD connected'));
driver.on('error', (err) => console.error('OBD error', err));
await driver.init();
const dtcList = await driver.readDtc();
console.log('DTC codes:', dtcList);
await driver.disconnect();

Пример 2: периодический опрос PID
await driver.init();
setInterval(async () => {
  const rpm = await driver.readPid('0C');
  const speed = await driver.readPid('0D');
  console.log(`RPM: ${rpm.value}, Speed: ${speed.value}`);
}, 1000);

Пример 3: очистка DTC с подтверждением
const confirmation = await askUserConfirmation('Clear all DTC?');
if (confirmation) {
  const success = await driver.clearDtc();
  console.log(success ? 'DTC cleared' : 'Failed to clear DTC');
}

РИСКИ И МИТИГАЦИЯ
Риск: закрытые протоколы специфичных адаптеров. Митигация: поддержка только ELM327 стандарта, документированные команды AT/OBD. Риск: зависимость от транспорта (serial/bluetooth доступность в ОС). Митигация: graceful fallback, явные сообщения об отсутствии драйверов. Риск: таймауты на медленных ECU. Митигация: настраиваемые таймауты, retry с backoff. Риск: неполные ответы (буферизация). Митигация: парсинг с учётом CR/LF, сборка фрагментов. Риск: отсутствие устройства в DEV. Митигация: DevTransport mock, но без генерации фейковых данных диагностики.

ROADMAP РАСШИРЕНИЯ
Фаза 1: базовый драйвер ELM327 Serial/Bluetooth, команды AT, 01, 03, 04. Фаза 2: Freeze Frame 02, расширенные PID 09 (VIN, calibration ID). Фаза 3: поддержка других адаптеров (OBDLink, Scantool), профили транспортов (CAN, ISO 9141). Фаза 4: UDS расширенные команды 22, 2E (read/write data by ID), 31 (routine control).

КРИТЕРИИ ACCEPTANCE
Код написан на TypeScript ESM strict mode. Интерфейс DeviceObd реализован полностью. Тесты юнит/интеграция/нагрузочные проходят. DEV mock отключаем в PROD. Логирование structured JSON. Метрики Prometheus зарегистрированы. Документация README и примеры созданы. База DTC загружена. Конфигурация валидируется. Без симуляций данных диагностики. Обработка всех сценариев сбоев (timeout, disconnect, parse error). События корректно emit'ятся. Статусы transitions валидны. Очередь команд работает с приоритетами.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций: .github/copilot-instructions.md и .github/instructions/instructions.instructions.md. Никаких эмодзи в коде и комментариях. Commit message формат: feat(obd): add ELM327 driver with serial/bluetooth support. Code review чек-лист: no magic numbers, explicit error handling, async/await everywhere, no console.log в PROD. Линтеры: ESLint max-warnings=0. Pre-commit hook: lint + test.

ССЫЛКИ И ИСТОЧНИКИ
ELM327 Datasheet: elmelectronics.com ELM327DS.pdf
SAE J1979: OBD-II PIDs standard
ISO 15031-5: Road vehicles - Communication between vehicle and external equipment for emissions-related diagnostics - Part 5: Emissions-related diagnostic services
node-bluetooth-obd-master: таблицы PID и формулы (packages/вспомогательные ресурсы/)
node-obd2-master: парсеры DTC (packages/вспомогательные ресурсы/)
ecu-simulator-master: ECU эмулятор для интеграционных тестов (packages/вспомогательные ресурсы/)

ИТОГ
По завершении промпта должен быть полностью функциональный низкоуровневый драйвер ELM327 с транспортами Serial/Bluetooth, парсингом PID/DTC, обработкой таймаутов и восстановлением, событиями, логированием, метриками, тестами юнит/интеграция/нагрузка, документацией, примерами, базой DTC, конфигурацией, DEV mock без симуляций данных. Драйвер готов к интеграции в REST/WebSocket API агента (следующий промпт). Код соответствует инструкциям проекта и готов к code review.
