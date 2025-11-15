# Промпт 2 OBD-II оркестрация и API агента

ЦЕЛЬ
Создать оркестрационный слой поверх драйвера ELM327 и предоставить REST/WebSocket API для фронтенда. Оркестратор управляет сессиями диагностики, state machine потока сканирования, агрегацией данных PID/DTC, очисткой DTC с подтверждением, обработкой ошибок. API эндпойнты для подключения, статуса, запуска сканирования, чтения результатов, очистки кодов. WebSocket для real-time статусов.

КОНТЕКСТ
Промпт 1 реализовал низкоуровневый драйвер Elm327Driver. Теперь нужен слой между драйвером и UI. Агент на Node.js Express предоставляет HTTP REST API и WebSocket для real-time. Клиент фронтенда вызывает API для запуска диагностики, получения статусов, очистки DTC. Вход: часть анализа 2, интерфейс DeviceObd из промпта 1, node-obd2-master оркестрация паттернов.

ГРАНИЦЫ
Оркестратор не занимается транспортом (это драйвер), не знает о payments/reports/UI. Он управляет сессиями диагностики, агрегирует данные, предоставляет API. Не хранит персональные данные клиентов, только технические данные сессий (sessionId, timestamp, results). Интеграция с PaymentService и ReportService происходит на уровне Application Layer, не здесь.

АРХИТЕКТУРА

МОДУЛЬ apps/kiosk-agent/src/obd/ObdOrchestrator.ts
Класс ObdOrchestrator. Конструктор принимает driver: DeviceObd. Методы: connect(), startScan(), getStatus(), getScanResults(), clearDtc(confirm: boolean), disconnect(). Внутренний state machine: DISCONNECTED → CONNECTING → CONNECTED → SCANNING → RESULTS_READY → IDLE. Хранение текущей сессии: sessionId UUID, status, dtcList, pidSnapshots, timestamps. EventEmitter для событий: session-started, scan-progress, scan-complete, dtc-cleared, error.

STATE MACHINE
Состояния: DISCONNECTED (начальное), CONNECTING (вызван connect, ждём driver.init), CONNECTED (init успешен, готовы к сканированию), SCANNING (выполняется readDtc и опрос PID), RESULTS_READY (сканирование завершено, данные доступны), IDLE (ожидание новой команды), ERROR (сбой, требуется переподключение). Переходы: DISCONNECTED → connect() → CONNECTING → driver connected event → CONNECTED → startScan() → SCANNING → scan complete → RESULTS_READY → clearDtc() или disconnect() → IDLE/DISCONNECTED. Таймауты: SCANNING макс 2 минуты, после чего автоматический переход в RESULTS_READY с частичными данными.

СЕССИИ apps/kiosk-agent/src/obd/Session.ts
Интерфейс DiagnosticSession: sessionId string UUID, startTime number, endTime number optional, status enum (in_progress, completed, failed, timeout), dtcList DtcEntry array, pidSnapshots PidSnapshot array, metadata object (vehicleMake optional, vehicleModel optional). PidSnapshot: timestamp, rpm, speed, coolantTemp, intakeTemp, throttle (все опциональные). Хранение сессий: in-memory Map sessionId → DiagnosticSession. TTL 1 час, после чего удаление. Persist опционально в SQLite для истории.

CONNECT
Метод connect(): проверка текущего статуса (если уже CONNECTED, возврат успех). Переход в CONNECTING. Вызов driver.init(config из конфига). Подписка на driver события connected/error. При connected: переход в CONNECTED, emit session-started. При error: переход в ERROR, emit error, логирование. Возврат Promise resolve/reject.

STARTSCAN
Метод startScan(): проверка статуса CONNECTED. Создание новой сессии: sessionId UUID, startTime Date.now(), status in_progress. Переход в SCANNING. Запуск последовательности: driver.readDtc() → сохранение dtcList → опрос PID (0C, 0D, 05, 0F, 11) каждые 500ms в течение 10 секунд → сохранение pidSnapshots. Прогресс: emit scan-progress с процентом (dtc read 50%, pid poll 50%). По завершении: endTime, status completed, переход в RESULTS_READY, emit scan-complete. При ошибке: status failed, переход в ERROR, emit error.

GETSTATUS
Метод getStatus(): возврат объекта: currentStatus state machine, sessionId если есть активная сессия, progress процент (0-100), message строка (например, "Scanning DTC", "Reading PIDs", "Complete"). WebSocket broadcast статуса при изменении.

GETSCANRESULTS
Метод getScanResults(sessionId: string): проверка наличия сессии. Возврат полного объекта DiagnosticSession. Если сессия не завершена: возврат текущего состояния с частичными данными. Если sessionId не найден: возврат 404.

CLEARDTC
Метод clearDtc(confirm: boolean): проверка confirm === true. Проверка статуса RESULTS_READY или IDLE. Вызов driver.clearDtc(). Логирование операции: sessionId, timestamp, result. Обновление текущей сессии: добавление поля dtcClearedAt timestamp, dtcClearResult boolean. Emit dtc-cleared. Возврат boolean success. Переход в IDLE.

DISCONNECT
Метод disconnect(): вызов driver.disconnect(). Переход в DISCONNECTED. Очистка текущей сессии (но сохранение в истории). Emit disconnected.

REST API apps/kiosk-agent/src/routes/obd.ts
Express Router. Эндпойнты:
POST /api/obd/connect: вызывает orchestrator.connect(). Возврат 200 OK {status: "connected"} или 500 {error}.
POST /api/obd/scan: вызывает orchestrator.startScan(). Возврат 202 Accepted {sessionId, status: "scanning"} или 400/500.
GET /api/obd/status: вызывает orchestrator.getStatus(). Возврат 200 {status, sessionId, progress, message}.
GET /api/obd/results/:sessionId: вызывает orchestrator.getScanResults(sessionId). Возврат 200 {session} или 404.
POST /api/obd/clear-dtc: body {confirm: true}. Вызывает orchestrator.clearDtc(confirm). Возврат 200 {success: true/false} или 400/500.
POST /api/obd/disconnect: вызывает orchestrator.disconnect(). Возврат 200 {status: "disconnected"}.
Middleware: error handler, request logger, CORS для localhost (DEV), rate limiting 10 req/min per IP.

WEBSOCKET apps/kiosk-agent/src/websocket/obdSocket.ts
WebSocket сервер на ws npm. Путь /ws/obd. Клиенты подключаются и подписываются на статусы. Сервер broadcast сообщений при изменении статуса: {type: "status-update", payload: {status, sessionId, progress, message}}. При scan-progress: broadcast прогресса. При scan-complete: broadcast завершения с результатами (если payload не слишком большой, иначе только уведомление и клиент делает GET /api/obd/results/:sessionId). Heartbeat каждые 30s для проверки соединения.

ОБРАБОТКА ОШИБОК
Все ошибки драйвера: перехват через подписку на driver error event. Категории ошибок: connection_failed, timeout, parse_error, unsupported_command, device_unavailable. Для каждой категории: соответствующий HTTP статус (503 для device_unavailable, 408 для timeout, 500 для остальных). Логирование с context. Возврат клиенту: {error: "description", code: "error_code", details: {}}.

ЛОГИРОВАНИЕ
Structured JSON: timestamp, level, message, context (sessionId, status, command, result). Correlation ID для трассировки запросов. Логи: info для нормальных операций, error для сбоев, debug для подробностей (DEV). Ротация логов: daily, 7 дней хранение.

МЕТРИКИ
Prometheus prom-client: obd_sessions_total counter, obd_scans_completed_total counter, obd_scans_failed_total counter {reason}, obd_dtc_cleared_total counter, obd_scan_duration_seconds histogram. Регистрация при старте агента. Экспорт через /metrics эндпойнт агента.

КОНФИГУРАЦИЯ apps/kiosk-agent/config/obd-orchestrator.json
{ "scanTimeout": 120000, "pidPollInterval": 500, "pidPollDuration": 10000, "sessionTTL": 3600000, "supportedPids": ["0C", "0D", "05", "0F", "11"], "maxConcurrentSessions": 1 }
Чтение конфига при инициализации. Валидация параметров.

ТЕСТЫ

ЮНИТ apps/kiosk-agent/src/obd/__tests__/ObdOrchestrator.test.ts
Mock driver. Тест connect: вызов driver.init, проверка перехода в CONNECTED. Тест startScan: mock driver.readDtc возвращает DTC, mock driver.readPid возвращает PID, проверка прогресса и завершения. Тест clearDtc: confirm true → driver.clearDtc вызван, confirm false → отклонено. Тест state machine: проверка всех переходов и валидация недопустимых переходов. Тест таймаута: сканирование длится >2 мин → автоматическое завершение.

ИНТЕГРАЦИЯ apps/kiosk-agent/src/obd/__tests__/integration-api.test.ts
Поднятие агента на тестовом порту. Mock driver. HTTP клиент supertest. Последовательность: POST /api/obd/connect → 200, POST /api/obd/scan → 202 {sessionId}, GET /api/obd/status → 200 {status: scanning, progress}, polling статуса до completed, GET /api/obd/results/:sessionId → 200 {dtcList, pidSnapshots}, POST /api/obd/clear-dtc {confirm: true} → 200, POST /api/obd/disconnect → 200. Проверка всех статусов и данных.

ИНТЕГРАЦИЯ WEBSOCKET apps/kiosk-agent/src/obd/__tests__/integration-ws.test.ts
WebSocket клиент ws. Подключение к /ws/obd. Подписка на события. Запуск сканирования через REST. Проверка получения status-update сообщений. Проверка heartbeat. Закрытие соединения.

E2E apps/kiosk-agent/src/obd/__tests__/e2e.test.ts
Реальный драйвер с ecu-simulator-master или DEV mock. Полный поток: connect → scan → получение результатов → clear DTC → disconnect. Проверка данных, логов, метрик. Длительность 5 минут с периодическим опросом статуса.

ДОКУМЕНТАЦИЯ apps/kiosk-agent/src/obd/README-API.md
Описание REST API эндпойнтов, форматы запросов/ответов, примеры curl, коды ошибок. Описание WebSocket протокола, формат сообщений, heartbeat. Диаграмма последовательности типичного потока. Troubleshooting секция.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
Пример 1: REST клиент curl
curl -X POST localhost:3000/api/obd/connect
curl -X POST localhost:3000/api/obd/scan
curl localhost:3000/api/obd/status
curl localhost:3000/api/obd/results/{sessionId}
curl -X POST localhost:3000/api/obd/clear-dtc -H "Content-Type: application/json" -d '{"confirm": true}'
curl -X POST localhost:3000/api/obd/disconnect

Пример 2: WebSocket клиент JS
const ws = new WebSocket('ws://localhost:3000/ws/obd');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'status-update') {
    console.log('Status:', msg.payload.status, 'Progress:', msg.payload.progress);
  }
};

Пример 3: фронтенд интеграция (схема, детали в промпте 4)
async function runDiagnostics() {
  await apiClient.post('/api/obd/connect');
  const { sessionId } = await apiClient.post('/api/obd/scan');
  const ws = connectWebSocket();
  ws.on('status-update', updateUI);
  await pollUntilComplete(sessionId);
  const results = await apiClient.get(`/api/obd/results/${sessionId}`);
  displayResults(results);
}

ИНТЕГРАЦИЯ С PAYMENT И REPORT
Оркестратор emit scan-complete событие. Application layer слушает событие. После завершения сканирования: проверка статуса оплаты (если paywall), генерация отчёта через ReportService, отправка email/SMS. Не реализуется здесь, только интерфейс событий. Детали в промптах 5 и 6.

БЕЗОПАСНОСТЬ
API эндпойнты защищены: rate limiting для предотвращения abuse. CORS настроен на localhost для DEV, на домен киоска для PROD. WebSocket проверка origin. Никаких персональных данных в логах (только sessionId, технические параметры). Секреты (если нужны) в .env, не в коде.

DEV РЕЖИМ
Флаг process.env.AGENT_ENV === 'DEV'. В DEV: driver может быть mock (DevTransport из промпта 1). API доступен на localhost:3000. Логи debug level. В PROD: driver реальный, API на внутреннем порту или только localhost (киоск не публичный сервер). Логи info level.

ОШИБКИ
Кастомные классы: ObdSessionError, ObdStateError. Все extends Error. Поля: message, code, sessionId, details. Возврат клиенту структурированных ошибок: {error, code, details}.

РИСКИ И МИТИГАЦИЯ
Риск: множественные параллельные сессии (киоск однопользовательский). Митигация: maxConcurrentSessions 1, при попытке второй сессии возврат 409 Conflict. Риск: долгое сканирование блокирует агента. Митигация: таймаут 2 минуты, async операции. Риск: WebSocket разрыв. Митигация: автоматическое переподключение на клиенте, heartbeat. Риск: утечка сессий в памяти. Митигация: TTL 1 час, периодическая очистка.

ROADMAP РАСШИРЕНИЯ
Фаза 1: базовая оркестрация и REST API, WebSocket статусы. Фаза 2: расширенные PID (09 VIN, калибровка), Freeze Frame интеграция. Фаза 3: поддержка нескольких адаптеров одновременно (если нужно). Фаза 4: история сессий с хранением в БД, аналитика.

КРИТЕРИИ ACCEPTANCE
ObdOrchestrator реализован с state machine. REST API эндпойнты работают. WebSocket broadcast статусов. Сессии управляются корректно (создание, TTL, очистка). clearDtc требует подтверждение. Ошибки обрабатываются и возвращаются клиенту. Логирование structured JSON. Метрики Prometheus. Тесты юнит/интеграция/E2E проходят. Документация API создана. Примеры работают. Без симуляций данных диагностики в PROD. Интеграция с драйвером из промпта 1 корректна. State transitions валидны. Таймауты настраиваемы. Rate limiting и CORS настроены. WebSocket heartbeat работает. Конфигурация валидируется. Код на TypeScript ESM strict. Линтеры проходят. Commit message: feat(obd-api): add orchestration layer and REST/WebSocket API.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций проекта. Никаких эмодзи. Code review чек-лист: state machine корректен, async/await, explicit errors, no console.log в PROD. Pre-commit: lint + test.

ИТОГ
По завершении должен быть полностью функциональный оркестрационный слой с REST/WebSocket API для диагностики OBD-II. Фронтенд может вызывать эндпойнты для запуска сканирования, получения результатов, очистки DTC. Real-time статусы через WebSocket. Интеграция с драйвером из промпта 1. Готов к интеграции с фронтендом (промпт 4) и платежами/отчётами (промпты 5-6).
