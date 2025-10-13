# Анализ часть 10 интеграции из доп ресурсы

КОНТЕКСТ
Цель: comprehensive mapping применимости всех категорий доп ресурсов, приоритизация, карта рисков лицензий, стратегия вынос тяжелых сервисов. Вход: resources-inventory.md, 10 категорий доп ресурсов.

ТАБЛИЦА ПРИМЕНИМОСТИ

АДМИН ПАНЕЛЬ
grafana-dashboards-3: использовать JSON дашборды для визуализации метрик киоска. Приоритет: высокий. Риск: лицензия Apache 2.0, ок. Внедрение: prompt 7.
openstatus-main: UI для отображения статусов сервисов. Приоритет: средний. Риск: MIT, ок. Внедрение: prompt 15 (SLA).
uptime-kuma-master: мониторинг uptime киосков. Приоритет: высокий. Риск: MIT, ок. Внедрение: prompt 7.
prometheus-master: конфиги для scraping метрик. Приоритет: высокий. Риск: Apache 2.0, ок. Внедрение: prompt 7.
sentry-master: паттерны error tracking. Приоритет: высокий. Риск: BSL (Business Source License), ок для self-hosted. Внедрение: prompt 7.
osquery-master: инвентаризация ОС киоска. Приоритет: средний. Риск: Apache 2.0/GPL, ок. Внедрение: prompt 13.
librenms-master: мониторинг сети. Приоритет: низкий (overkill). Риск: GPL v3, ок. Внедрение: опционально.
skywalking-master: distributed tracing. Приоритет: низкий (киоск не распределенный). Риск: Apache 2.0, ок. Внедрение: опционально.
Opserver-main: мониторинг SQL. Приоритет: низкий (если SQL аналитика внедрена). Риск: MIT, ок. Внедрение: prompt 11.

БИБЛИОТЕКИ
ant-design-master: UI компоненты для админ-консоли оператора. Приоритет: высокий. Риск: MIT, ок. Внедрение: prompt 12.
vue-element-admin-master: шаблон админ-панели. Приоритет: высокий. Риск: MIT, ок. Внедрение: prompt 12.
animate.css-main: анимации для фронтенда киоска. Приоритет: средний. Риск: MIT, ок. Внедрение: prompt 4.

ЗАЩИТА
wazuh-main: SIEM/EDR агент на киоске. Приоритет: высокий. Риск: GPL v2, ок для self-hosted. Внедрение: prompt 8.
firezone-main: Zero Trust VPN для удаленного доступа. Приоритет: высокий. Риск: Apache 2.0, ок. Внедрение: prompt 8.
guacamole-server-main: web-based remote access. Приоритет: средний. Риск: Apache 2.0, ок. Внедрение: prompt 8.
MeshCentral-master: agent-based remote management. Приоритет: средний. Риск: Apache 2.0, ок. Внедрение: prompt 8.

ИИ
activepieces-main: workflow orchestration для автоматизации задач. Приоритет: средний. Риск: MIT, ок. Внедрение: prompt 14.
ai-main: паттерны ИИ оркестрации. Приоритет: низкий (референс). Риск: неизвестно, проверить. Внедрение: опционально.

ПЕРЕДАЧА ФАЙЛОВ
seafile-master: хранение и синхронизация отчетов. Приоритет: средний (если нужен долгосрочный архив). Риск: AGPLv3, ок для self-hosted. Внедрение: prompt 9.
kinto-main: синхронизация JSON данных (sessions, metrics). Приоритет: низкий. Риск: Apache 2.0, ок. Внедрение: опционально.
garage-main-v1, bewcloud-main: альтернативы хранения. Приоритет: низкий. Риск: AGPLv3/Apache 2.0, ок. Внедрение: опционально.

СЕРВИСЫ И APK
dbeaver-devel: IDE для работы с SQLite. Приоритет: низкий (инструмент разработки). Риск: Apache 2.0, ок. Внедрение: dev environment only.
prisma-main: ORM для БД. Приоритет: средний (если расширяем схему). Риск: Apache 2.0, ок. Внедрение: опционально.
spark-master, tidb-master: тяжелые аналитические БД. Приоритет: низкий (overkill для киоска). Риск: Apache 2.0, ок. Внедрение: опционально для центральной аналитики.
pocketbase-master: легкий сервер с встроенной БД. Приоритет: средний (альтернатива агенту). Риск: MIT, ок. Внедрение: опционально.

ТОЛЩИНОМЕР ЛКП
BLE_THSensor-master: паттерны BLE GATT. Приоритет: высокий. Риск: MIT, ок. Внедрение: prompt 3.
ble_monitor-master: референс GATT профилей. Приоритет: высокий. Риск: MIT, ок. Внедрение: prompt 3.
TFT_eSPI-master: идеи отображения на экране устройства. Приоритет: низкий. Риск: FreeBSD, ок. Внедрение: опционально.

УДАЛЕННЫЙ ДОСТУП
См. ЗАЩИТА: firezone, guacamole, MeshCentral.

PROXY
imgproxy-master: трансформация изображений (логотипы, отчеты). Приоритет: средний. Риск: MIT, ок. Внедрение: prompt 10.
iodine-master: IP-over-DNS туннелирование. Приоритет: низкий (edge case). Риск: ISC, ок. Внедрение: опционально.

SQL
countly-server-master: event analytics. Приоритет: средний (если нужна аналитика событий). Риск: AGPLv3, ок для self-hosted. Внедрение: prompt 11.
druid-master: OLAP аналитика. Приоритет: низкий (overkill). Риск: Apache 2.0, ок. Внедрение: опционально для центральной аналитики.
aptabase-main: telemetry. Приоритет: средний (если нужна аналитика использования). Риск: MIT, ок. Внедрение: prompt 11.

ПРИОРИТИЗАЦИЯ

ВЫСОКИЙ (немедленное внедрение)
grafana-dashboards-3 (prompt 7)
prometheus-master (prompt 7)
uptime-kuma-master (prompt 7)
sentry-master (prompt 7)
wazuh-main (prompt 8)
firezone-main (prompt 8)
ant-design-master (prompt 12)
vue-element-admin-master (prompt 12)
BLE_THSensor-master (prompt 3)
ble_monitor-master (prompt 3)

СРЕДНИЙ (после core функций)
openstatus-main (prompt 15)
osquery-master (prompt 13)
guacamole-server-main (prompt 8)
MeshCentral-master (prompt 8)
activepieces-main (prompt 14)
seafile-master (prompt 9)
animate.css-main (prompt 4)
imgproxy-master (prompt 10)
countly-server-master (prompt 11)
aptabase-main (prompt 11)
prisma-main (опционально)
pocketbase-master (опционально)

НИЗКИЙ (опционально или референс)
librenms-master
skywalking-master
Opserver-main
ai-main
kinto-main
garage-main-v1, bewcloud-main
dbeaver-devel
spark-master, tidb-master
TFT_eSPI-master
iodine-master
druid-master

КАРТА РИСКОВ ЛИЦЕНЗИЙ

ЗЕЛЕНАЯ ЗОНА (без ограничений)
MIT: ant-design, vue-element-admin, animate.css, sentry (self-hosted), BLE_THSensor, ble_monitor, pocketbase, imgproxy, aptabase
Apache 2.0: grafana, prometheus, uptime-kuma, osquery, firezone, guacamole, MeshCentral, activepieces, kinto, prisma, spark, tidb
ISC: iodine
FreeBSD: TFT_eSPI

ЖЕЛТАЯ ЗОНА (ок для self-hosted, проверить при SaaS)
AGPLv3: seafile, countly, garage, bewcloud (требуют публикацию кода при модификации, ок если не SaaS)
GPL v2/v3: wazuh, librenms (требуют публикацию кода, ок для внутреннего использования)
BSL: sentry (Business Source License, free for self-hosted до лимита, платно при масштабе)

КРАСНАЯ ЗОНА (проверить детально)
ai-main: лицензия неизвестна, требуется проверка

СТРАТЕГИЯ ВЫНОС ТЯЖЕЛЫХ СЕРВИСОВ

НА КИОСКЕ (локально)
Node.js агент (легкий)
SQLite БД
Prometheus экспорт метрик
Wazuh агент
Firezone клиент
Минимальные логи

ВНЕ КИОСКА (центральный сервер/кластер)
Grafana (визуализация метрик всех киосков)
Prometheus (сбор и хранение метрик)
Uptime Kuma (мониторинг uptime)
Sentry (агрегация ошибок)
Guacamole/MeshCentral (remote access gateway)
Seafile (архив отчетов)
Countly/Aptabase (аналитика событий)
Spark/TiDB/Druid (если нужна тяжелая аналитика)
LibreNMS, Skywalking (опционально)

ROADMAP ИНТЕГРАЦИЙ

ЭТАП 1 (Core MVP)
Prompts 1-6: OBD, Thickness, Frontend, Payments, Reports

ЭТАП 2 (Monitoring и Security)
Prompt 7: Prometheus, Grafana, Sentry, Uptime Kuma
Prompt 8: Wazuh, Firezone, Guacamole/MeshCentral

ЭТАП 3 (Integrations)
Prompt 9: Seafile (архив отчетов)
Prompt 10: imgproxy (оптимизация изображений)

ЭТАП 4 (Analytics и Admin)
Prompt 11: Countly/Aptabase (аналитика)
Prompt 12: ant-design, vue-element-admin (админ-консоль)
Prompt 13: osquery (инвентаризация)

ЭТАП 5 (Automation и SLA)
Prompt 14: activepieces (автоматизация)
Prompt 15: openstatus, SLA tracking

ВАЛИДАЦИЯ

КАЖДЫЙ PROMPT
Проверка лицензий: нет конфликтов, совместимость с проектом
Проверка зависимостей: нет циклических зависимостей
Тесты интеграции: mock внешних сервисов
Документация: README интеграции, конфигурационные примеры

КРИТЕРИИ ГОТОВНОСТИ
Таблица применимости заполнена, приоритизация определена, карта рисков лицензий проверена, стратегия вынос сервисов задокументирована, roadmap определен, валидация настроена.
