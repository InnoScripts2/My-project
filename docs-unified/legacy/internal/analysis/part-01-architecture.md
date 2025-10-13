# Анализ часть 1 архитектура и границы слоев

КОНТЕКСТ
Монорепозиторий содержит фронтенд киоска, локальный агент, Android WebView оболочку, интеграции, документы и ресурсы. Цель анализа: зафиксировать четкие границы UI, Application, Domain, Device Drivers, Infra, определить экспортные интерфейсы, минимизировать связность, подготовить базу для безопасного расширения.

ДИРЕКТОРИИ И СВЯЗИ
Корень: index.html, styles.css, manifest.webmanifest, service-worker.js как статический UI. apps/android-kiosk с WebView (MainActivity.kt, AndroidManifest.xml, strings.xml). 03-apps/02-application/kiosk-agent с исходниками агента (TS, ESM). packages для общих модулей (report, payments и др. предполагаемые). infra/scripts для сборок и утилит. docs с эксплуатационной документацией. .github/workflows/deploy.yml для Pages. Вспомогательные директории с артефактами и сторонними проектами не входят в runtime киоска.

ГРАНИЦЫ UI
UI не обращается напрямую к устройствам. Все взаимодействия через HTTP/WS к локальному агенту. Dev-флаг активирует кнопки пропуска только в DEV. Paywall блюрит экран до оплаты. Service Worker cache контролируем через ревизии, GitHub Pages деплой должен инвалидацировать кеш по смене имени файла или хэша.

ГРАНИЦЫ APPLICATION
Агент обеспечивает оркестрацию процессов: сессии, шаги, статусы, таймауты, очереди задач, ретраи, журналирование. Application слой не содержит низкоуровневого I/O устройств. Взаимодействие через портовые интерфейсы DeviceObd, DeviceThickness, LockController, PaymentService, ReportService.

ГРАНИЦЫ DOMAIN
Чистые модели: DtcEntry, DiagnosticSummary, ThicknessMeasurement, PaymentIntent, ReportMetadata. Валидация входов через Zod схемы. Без зависимостей от транспорта и фреймворков. Domain определяет инварианты и бизнес-правила.

DRIVERS И INFRA
Drivers: имплементации DeviceObd (ELM327), DeviceThickness (BLE/SDK), LockController (GPIO/Relay), доступ к COM/BLE. Infra: HTTP API, WebSocket, Prometheus экспорт, e-mail/SMS адаптеры, хранилище локальных файлов отчетов, конфигурации ENV.

КОНТРАКТЫ И СТАБЫ
DeviceObd: init, readDtc, clearDtc, readPid, getStatus, on(event). DeviceThickness: init, start, stop, on(event), getStatus. PaymentService: createIntent, getStatus, confirm (dev). ReportService: generatePDF, generateHTML, deliverEmail, deliverSMS. LockController: openSlot, closeSlot, status. Контракты фиксируются в TS интерфейсах в packages. Стаб-реализации для DEV должны быть изолированы фичефлагами AGENT_ENV.

ИМПОРТНЫЕ ПРАВИЛА
UI импортирует только публичные HTTP/WS контракты. Application импортирует Domain и Ports. Drivers реализуют Ports и не импортируют Application. Infra не импортирует Domain моделей напрямую без портов. Запрет циклических зависимостей. ESM пути через tsconfig path aliases. Линтер на запрещенные импорты.

КОНФИГУРАЦИЯ
ENV: DEV, QA, PROD. Переменные: порты, таймауты устройств, пути хранения отчетов, DSN наблюдаемости. Конфиги валидируются Zod. Значения по умолчанию безопасные. DEV включает авто-подтверждение платежей, кнопки пропуска, заглушки устройств.

ОШИБКИ И КОДЫ СОСТОЯНИЯ
Единый формат ошибок JSON: code, message, details, correlationId. Категории: device_unavailable, device_timeout, format_error, payment_failed, report_failed. UI отображает человеко-понятные статусы без технических деталей.

СЕССИИ И ТАЙМАУТЫ
SessionManager с авто-сбросом по неактивности. Watchdog перезапускает длительные операции. Таймауты для подключения устройств, сканирования, генерации отчета, доставки. Чистка временных файлов по расписанию.

МЕТРИКИ
Prometheus: http_requests_total, http_request_duration_seconds, obd_read_dtc_total, obd_clear_dtc_total, obd_errors_total, thickness_measurements_total, payments_intents_total, payments_confirmed_total, report_generated_total, report_delivered_total, app_sessions_active. Метки: env, route, status.

РИСКИ И МИТИГАЦИИ
Риск пересечения слоев: фиксируем через линтер и path rules. Риск утечки персональных данных: минимизация полей и сроки хранения. Риск зависания устройств: ретраи и circuit breaker. Риск дивергенции фронтенда и API: контрактные тесты и версионирование endpoint.

КРИТЕРИИ ГОТОВНОСТИ
Список интерфейсов утвержден. Пакет packages/* с интерфейсами создан. Линтер импортов включает правила слоев. Документация по ошибкам и метрикам добавлена. Service Worker политика кеша обновлена под Pages.
