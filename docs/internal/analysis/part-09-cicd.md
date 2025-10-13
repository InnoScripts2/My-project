# Анализ часть 9 CI/CD и эксплуатация

КОНТЕКСТ
Цель: автоматизация сборок, тестов, деплоя, мониторинг здоровья агента, watchdog, SLA. Вход: .github/workflows, infra/scripts, текущие практики.

GITHUB ACTIONS ПАЙПЛАЙН
Матрица Node: 18, 20. Кеш npm для зависимостей. Джобы: lint (ESLint, HTMLHint), test (unit, integration), build (agent, frontend). Artifact upload: agent tarball, frontend dist. Деплой Pages: автоматически при push в main. Ретраи при сбоях GitHub API.

APK СБОРКА
Скрипт infra/scripts/apk-build.ps1: packaging агента и фронтенда. Версионирование: semver из package.json или Git tag. Подпись артефактов: GPG или встроенная. Публикация: GitHub Releases или внутренний репозиторий. Тестирование на стейдж-киоске перед prod.

LINT И ТЕСТЫ
ESLint: max-warnings=0, TypeScript strictness. HTMLHint: accessibilty, валидность HTML. Unit-тесты: Node Test Runner, покрытие >80%. Интеграционные тесты: драйверы на моках, API endpoints. E2E: Playwright для критических потоков (diagnostics, payments). Таймауты CI: 5 min lint, 10 min tests, 15 min E2E.

HEALTH CHECKS АГЕНТА
Эндпойнты: /api/health (liveness), /api/ready (readiness). Проверки: подключение к БД (SQLite), статус device adapters, доступность payment service, состояние очереди отчетов. Ответы: 200 OK или 503 Service Unavailable. Логирование результатов проверок.

WATCHDOG ПРОЦЕССЫ
Supervisor или systemd для агента. Автоматический перезапуск на сбой. Exponential backoff: 1s, 2s, 4s, max 30s. Алерты на повторные перезапуски (>3 за час). Лимиты: макс 10 перезапусков за 10 min, потом manual intervention.

АВТО-СБРОС СЕССИЙ
Таймаут бездействия: 2 min на экранах выбора, 5 min на экранах действия. Watchdog фронтенда: проверка heartbeat каждые 30s. При таймауте: навигация на attract screen, очистка sessionStorage/localStorage (кроме devMode), disconnect устройств.

SLA ОПРЕДЕЛЕНИЯ
Uptime: 99.5% monthly (исключая запланированное обслуживание). Время восстановления (MTTR): <15 min для критичных сбоев. Доступность устройств: OBD >95%, толщиномер >95%. Успешность платежей: >98%. Успешность доставки отчетов: >95%. Алерты: response time <5 min для критичных инцидентов.

ПРОЦЕДУРЫ ВОССТАНОВЛЕНИЯ
Agent down: Supervisor restart, проверка логов, rollback на предыдущую версию. Device unavailable: проверка подключения, перезагрузка адаптера, замена устройства. Payment service failure: переключение на backup PSP (если есть), manual processing. Disk full: очистка старых логов и отчетов, расширение диска. Network loss: очередь операций, синхронизация при восстановлении.

УВЕДОМЛЕНИЯ
Slack/Email на CI failure, критичные алерты, deploy завершен. PagerDuty для critical incidents (agent down >2 min, payment failure rate >10%). Еженедельные отчеты: uptime, количество сессий, ошибки, метрики SLA.

ТЕСТЫ
CI pipeline: симуляция lint/test failures, проверка ретраев. Health checks: моки сервисов unavailable, timeouts. Watchdog: kill агента, проверка restart. Авто-сброс: эмуляция бездействия, проверка навигации. SLA tracking: метрики Prometheus, дашборды Grafana.

РИСКИ
CI зависимость от GitHub: self-hosted runner как fallback. APK сборка: корректность версионирования, подпись. Watchdog loops: лимиты перезапусков. SLA недостижим: балансировка между uptime и обслуживанием. Процедуры восстановления: регулярные drills.

КРИТЕРИИ ГОТОВНОСТИ
GitHub Actions настроены, APK сборка автоматизирована, health checks реализованы, watchdog конфигурирован, SLA определены, процедуры задокументированы, уведомления работают, тесты определены.
