# Анализ часть 7 мониторинг и алерты

КОНТЕКСТ
Цель: внедрить метрики агента, UI health и дашборды. Вход: apps/kiosk-agent/src/monitoring/*, доп ресурсы grafana-dashboards-3, prometheus-master, sentry-master.

МЕТРИКИ АГЕНТА
Prometheus client: prom-client. Метрики: http_requests_total, http_request_duration_seconds, obd_connections_total, obd_dtc_read_total, obd_errors_total, thickness_sessions_total, payments_intents_total, report_generated_total, app_sessions_active, device_status_gauge. Экспорт: /metrics endpoint. Scrape interval: 15 сек.

АЛЕРТЫ
Prometheus rules: device_unavailable (status=0 > 5 min), payment_failure_rate (>10% за 10 min), report_delivery_failures (>5 за час), agent_down (up=0 > 2 min). Alertmanager: группировка, throttling, маршрутизация на email/webhook.

ДАШБОРДЫ GRAFANA
Источник: grafana-dashboards-3. Панели: Kiosk Overview (sessions, payments, devices status), OBD Diagnostics (connections, DTC reads, errors), Thickness Measurements (sessions, measurements count), Payments (intents, confirmations, failures), Reports (generated, delivered, errors), System Health (CPU, RAM, disk, uptime). Экспорт в JSON для версионирования.

SENTRY ИНТЕГРАЦИЯ
SDK: @sentry/node, @sentry/browser. Уровни: error, warning. Контекст: sessionId, env, deviceType. Фильтры: без PII, маскирование токенов. Release tracking: версия агента и фронтенда. Source maps: для JS ошибок. Алерты на новые типы ошибок.

ЛОГИ
Формат: JSON structured logs. Поля: timestamp, level, message, context, correlationId. Без PII. Уровни: debug (DEV), info, warn, error. Ротация: по дню, лимит 7 дней. Агрегация: опционально в Loki или CloudWatch.

UI HEALTH
Endpoint: /api/health (liveness), /api/ready (readiness). Проверки: database connection, device adapters availability, payment service status. HTTP 200 OK, 503 Service Unavailable. Uptime Kuma или openstatus для внешнего мониторинга.

ТЕСТЫ
Юнит: метрики инкремент, алерты условия. Интеграция: scrape /metrics, проверка формата, Grafana импорт панелей. E2E: trigger alert и проверка уведомления.

РИСКИ
Шум алертов: правильные пороги и throttling. Версии Grafana: совместимость панелей. PII в логах: валидация и маскирование. Нагрузка метрик: оптимизация cardinality.

КРИТЕРИИ ГОТОВНОСТИ
Метрики экспортируются, алерты настроены, дашборды импортированы, Sentry интегрирован, логи структурированы, health endpoints работают, тесты определены.
