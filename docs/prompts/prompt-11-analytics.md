# Промпт 11 аналитика и SQL отчетность

ЦЕЛЬ
Реализовать аналитический слой для агрегации и анализа данных киосков через DuckDB in-process OLAP database, SQL запросы для бизнес-метрик количество сессий по дням выручка по услугам популярные ошибки OBD топ измерений толщиномера, экспорт результатов в CSV JSON для дашбордов, интеграция с промптом 7 для визуализации трендов в Grafana, scheduled задачи для ежедневных агрегаций. Цель: insights для операторов и бизнеса, трендовый анализ, выявление проблем, оптимизация услуг.

КОНТЕКСТ
Промпты 1-6 генерируют операционные данные: OBD сессии DTC коды, толщиномер замеры, платежи intents confirmations failures, отчеты генерация доставка. Эти данные хранятся в SQLite или простых файлах, достаточно для операционных нужд но не для аналитики. Для анализа требуется: агрегация по периодам день неделя месяц, join данных из разных источников сессии платежи отчеты, сложные фильтрации WHERE условия, window functions для трендов, export для внешних систем BI tools Excel. DuckDB предоставляет SQL OLAP движок работающий in-process без отдельного сервера, поддерживает Parquet CSV JSON sources, быстрые аналитические запросы, совместим с PostgreSQL синтаксисом. Интеграция: AnalyticsService читает данные из промптов 1-6 storage, загружает в DuckDB для анализа, возвращает результаты через REST API или scheduled export. Зависимости: промпт 7 monitoring Grafana визуализирует аналитические метрики, промпт 12 админ-панель операторов показывает дашборды.

ГРАНИЦЫ
Внутри: AnalyticsService инициализация DuckDB schema создание views, SQL query builder для типовых запросов sessions revenue errors trends, scheduled aggregations cron ежедневно, export методы CSV JSON Excel, REST API endpoints для получения analytics. Вне: внешние BI tools Tableau PowerBI подключение, data warehousing центральное хранилище, machine learning модели для прогнозирования, real-time streaming analytics. Интеграция: промпты 1-6 записывают данные в structured storage SQLite или JSON files, промпт 11 читает для анализа, промпт 7 Grafana использует analytics API для визуализации, промпт 12 админ-панель запрашивает дашборды.

АРХИТЕКТУРА

МОДУЛЬ AnalyticsService
Файл apps/kiosk-agent/src/analytics/AnalyticsService.ts
Класс AnalyticsService методы:

- initDatabase dbPath string returns Promise void
- loadData sources array DataSource returns Promise LoadResult
- executeQuery sql string params array any returns Promise QueryResult
- getSessionsReport filter SessionsFilter returns Promise SessionsReport
- getRevenueReport filter RevenueFilter returns Promise RevenueReport
- getErrorsReport filter ErrorsFilter returns Promise ErrorsReport
- exportResults results QueryResult format csv|json|xlsx returns Promise string filePath

DataSource interface:

- name string например sessions payments reports
- type sqlite|csv|json|parquet
- path string путь к файлу или БД
- tableName string имя таблицы в DuckDB после загрузки

LoadResult interface:

- loaded number count of rows
- tables array string список загруженных таблиц
- errors array string
- duration number ms

QueryResult interface:

- rows array object результаты запроса
- columns array string имена колонок
- rowCount number
- duration number ms

Инициализация DuckDB:

```typescript
import Database from 'duckdb';

const db = new Database.Database(':memory:');
const conn = db.connect();

await conn.run('CREATE TABLE sessions (session_id VARCHAR, created_at TIMESTAMP, type VARCHAR, status VARCHAR, device VARCHAR)');
await conn.run('CREATE TABLE payments (payment_id VARCHAR, session_id VARCHAR, amount DECIMAL, status VARCHAR, created_at TIMESTAMP)');
await conn.run('CREATE TABLE reports (report_id VARCHAR, session_id VARCHAR, type VARCHAR, generated_at TIMESTAMP, delivered BOOLEAN)');
await conn.run('CREATE TABLE obd_dtc (session_id VARCHAR, dtc_code VARCHAR, description VARCHAR, severity VARCHAR, occurred_at TIMESTAMP)');
await conn.run('CREATE TABLE thickness_measurements (session_id VARCHAR, zone VARCHAR, value DECIMAL, measured_at TIMESTAMP)');
```

loadData процесс:

- Для SQLite sources: `ATTACH 'path/to/db.sqlite' AS source_db; INSERT INTO sessions SELECT * FROM source_db.sessions;`
- Для CSV sources: `COPY sessions FROM 'path/to/sessions.csv' (HEADER, DELIMITER ',');`
- Для JSON sources: `CREATE TABLE sessions AS SELECT * FROM read_json_auto('path/to/sessions.json');`
- Для Parquet sources: `CREATE TABLE sessions AS SELECT * FROM read_parquet('path/to/sessions.parquet');`

МОДУЛЬ QueryBuilder
Файл apps/kiosk-agent/src/analytics/QueryBuilder.ts
Класс QueryBuilder методы:

- buildSessionsQuery filter SessionsFilter returns string SQL
- buildRevenueQuery filter RevenueFilter returns string SQL
- buildErrorsQuery filter ErrorsFilter returns string SQL
- buildTrendsQuery filter TrendsFilter returns string SQL

SessionsFilter interface:

- startDate string ISO8601
- endDate string ISO8601
- type THICKNESS|DIAGNOSTICS optional
- status completed|incomplete optional
- groupBy day|week|month default day

SessionsReport interface:

- period string например 2025-01-15
- totalSessions number
- completedSessions number
- incompleteSessions number
- byType object {THICKNESS: number, DIAGNOSTICS: number}
- avgDuration number seconds

buildSessionsQuery пример:

```sql
SELECT
  DATE_TRUNC('day', created_at) AS period,
  COUNT(*) AS total_sessions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
  SUM(CASE WHEN status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete_sessions,
  SUM(CASE WHEN type = 'THICKNESS' THEN 1 ELSE 0 END) AS thickness_sessions,
  SUM(CASE WHEN type = 'DIAGNOSTICS' THEN 1 ELSE 0 END) AS diagnostics_sessions,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_duration_seconds
FROM sessions
WHERE created_at >= ? AND created_at <= ?
  AND (? IS NULL OR type = ?)
  AND (? IS NULL OR status = ?)
GROUP BY period
ORDER BY period ASC;
```

RevenueFilter interface:

- startDate string
- endDate string
- groupBy day|week|month|service default day

RevenueReport interface:

- period string
- totalRevenue number
- byService object {THICKNESS: number, DIAGNOSTICS: number}
- avgTransactionValue number
- failedPayments number
- failureRate number percentage

buildRevenueQuery пример:

```sql
SELECT
  DATE_TRUNC('day', p.created_at) AS period,
  SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END) AS total_revenue,
  SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'THICKNESS' THEN p.amount ELSE 0 END) AS thickness_revenue,
  SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'DIAGNOSTICS' THEN p.amount ELSE 0 END) AS diagnostics_revenue,
  AVG(CASE WHEN p.status = 'confirmed' THEN p.amount END) AS avg_transaction_value,
  SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
  (SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) AS failure_rate
FROM payments p
JOIN sessions s ON p.session_id = s.session_id
WHERE p.created_at >= ? AND p.created_at <= ?
GROUP BY period
ORDER BY period ASC;
```

ErrorsFilter interface:

- startDate string
- endDate string
- device obd|thickness optional
- severity high|medium|low optional
- limit number default 100

ErrorsReport interface:

- topErrors array {code: string, description: string, count: number, severity: string}
- totalErrors number
- byDevice object {obd: number, thickness: number}

buildErrorsQuery пример:

```sql
SELECT
  dtc_code AS code,
  description,
  COUNT(*) AS count,
  severity
FROM obd_dtc
WHERE occurred_at >= ? AND occurred_at <= ?
  AND (? IS NULL OR severity = ?)
GROUP BY dtc_code, description, severity
ORDER BY count DESC
LIMIT ?;
```

МОДУЛЬ ScheduledAggregations
Файл apps/kiosk-agent/src/analytics/ScheduledAggregations.ts
Класс ScheduledAggregations методы:

- scheduleDailyAggregation cronExpression string returns void
- runDailyAggregation returns Promise AggregationResult
- scheduleWeeklyReport cronExpression string returns void
- runWeeklyReport returns Promise ReportResult

AggregationResult interface:

- date string дата агрегации
- sessionsProcessed number
- revenueCalculated number
- errorsAggregated number
- exportPath string optional путь к экспортированному файлу
- duration number ms

Логика runDailyAggregation:

- Определяет дату вчерашний день для агрегации
- Вызывает AnalyticsService.loadData для загрузки данных за вчера
- Выполняет SQL запросы для агрегации sessions revenue errors
- Сохраняет результаты в aggregations table или отдельный файл aggregations-YYYY-MM-DD.json
- Опционально экспортирует в CSV для импорта в Grafana или Excel
- Логирует результат в structured logger
- Возвращает AggregationResult

Scheduling через node-cron:

```typescript
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {
  const result = await scheduledAggregations.runDailyAggregation();
  console.log('Daily aggregation completed:', result);
});
```

МОДУЛЬ ExportService
Файл apps/kiosk-agent/src/analytics/ExportService.ts
Класс ExportService методы:

- exportToCsv results QueryResult filePath string returns Promise string
- exportToJson results QueryResult filePath string returns Promise string
- exportToExcel results QueryResult filePath string returns Promise string
- uploadToStorage filePath string destination string returns Promise UploadResult

exportToCsv процесс:

- Использует библиотеку csv-writer или fast-csv
- Генерирует CSV с header строкой column names
- Записывает rows в CSV формат
- Сохраняет в filePath exports/filename.csv
- Возвращает путь к файлу

exportToExcel процесс:

- Использует библиотеку exceljs
- Создает workbook с worksheet
- Добавляет header row с форматированием bold
- Заполняет data rows
- Применяет auto-filter и column widths
- Сохраняет в filePath exports/filename.xlsx
- Возвращает путь к файлу

МОДУЛЬ DashboardService
Файл apps/kiosk-agent/src/analytics/DashboardService.ts
Класс DashboardService методы:

- getOverviewDashboard filter DateFilter returns Promise OverviewDashboard
- getServicePerformanceDashboard filter DateFilter returns Promise ServicePerformanceDashboard
- getFinancialDashboard filter DateFilter returns Promise FinancialDashboard

OverviewDashboard interface:

- totalSessions number
- totalRevenue number
- activeDevices number
- avgSessionDuration number seconds
- topErrors array {code: string, count: number}
- trendsChart array {date: string, sessions: number, revenue: number}

Логика getOverviewDashboard:

- Параллельно выполняет несколько запросов: sessions count, revenue sum, errors top 5, trends last 30 days
- Агрегирует результаты в один объект OverviewDashboard
- Возвращает для отображения в админ-панели промпт 12

REST API

GET /api/analytics/sessions
Получить sessions report
Query params: startDate endDate type status groupBy
Ответ: 200 OK application/json

```json
{
  "data": [
    {"period": "2025-01-15", "totalSessions": 45, "completedSessions": 40, "incompleteSessions": 5, "byType": {"THICKNESS": 25, "DIAGNOSTICS": 20}, "avgDuration": 450}
  ],
  "total": 30,
  "duration": 120
}
```

GET /api/analytics/revenue
Получить revenue report
Query params: startDate endDate groupBy
Ответ: 200 OK application/json

```json
{
  "data": [
    {"period": "2025-01-15", "totalRevenue": 18000, "byService": {"THICKNESS": 10000, "DIAGNOSTICS": 8000}, "avgTransactionValue": 400, "failedPayments": 2, "failureRate": 0.044}
  ],
  "total": 30,
  "duration": 150
}
```

GET /api/analytics/errors
Получить errors report
Query params: startDate endDate device severity limit
Ответ: 200 OK application/json

```json
{
  "topErrors": [
    {"code": "P0420", "description": "Catalyst System Efficiency Below Threshold", "count": 15, "severity": "medium"}
  ],
  "totalErrors": 50,
  "byDevice": {"obd": 40, "thickness": 10}
}
```

GET /api/analytics/dashboard/overview
Получить overview dashboard
Query params: startDate endDate
Ответ: 200 OK application/json

```json
{
  "totalSessions": 450,
  "totalRevenue": 180000,
  "activeDevices": 2,
  "avgSessionDuration": 420,
  "topErrors": [{"code": "P0420", "count": 15}],
  "trendsChart": [{"date": "2025-01-15", "sessions": 45, "revenue": 18000}]
}
```

POST /api/analytics/export
Экспорт results в файл
Запрос: application/json

```json
{
  "query": "SELECT * FROM sessions WHERE created_at >= '2025-01-01'",
  "format": "csv"
}
```

Ответ: 200 OK application/json

```json
{
  "filePath": "exports/sessions-2025-01-15.csv",
  "rowCount": 450,
  "size": 102400
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/analytics/tests/

- AnalyticsService.test.ts: initDatabase создает schema tables, loadData загружает из mock SQLite CSV JSON sources, executeQuery возвращает QueryResult, getSessionsReport фильтрация по датам и типу
- QueryBuilder.test.ts: buildSessionsQuery генерирует корректный SQL с placeholders, buildRevenueQuery join sessions и payments, buildErrorsQuery GROUP BY и ORDER BY count DESC, параметризация WHERE условий
- ExportService.test.ts: exportToCsv создает файл с header и data rows, exportToJson валидный JSON array, exportToExcel workbook с worksheet и formatting

Интеграционные тесты apps/kiosk-agent/src/analytics/tests/integration/

- duckdb-integration.test.ts: инициализация DuckDB in-memory, загрузка реальных SQLite данных sessions payments, выполнение сложного JOIN запроса, проверка результатов rowCount и columns, export в CSV
- aggregations.test.ts: runDailyAggregation выполняет агрегацию за вчера, проверка aggregations table содержит новую запись, export файл существует и содержит данные
- dashboard-api.test.ts: GET /api/analytics/dashboard/overview возвращает OverviewDashboard, все поля присутствуют, trendsChart array не пустой, duration < 1000ms

E2E тесты apps/kiosk-agent/src/analytics/tests/e2e/

- full-analytics-flow.test.ts: клиенты проходят 10 сессий THICKNESS и DIAGNOSTICS за день, платежи подтверждаются, runDailyAggregation агрегирует данные, getSessionsReport возвращает 10 sessions, getRevenueReport revenue соответствует платежам, export CSV импортируется в Excel
- scheduled-aggregations.test.ts: scheduleDailyAggregation с тестовым cron каждую минуту, ожидание срабатывания, проверка aggregations файл создан, metrics analytics_aggregations_total инкрементирована
- grafana-integration.test.ts: экспорт trendsChart в CSV, импорт в Grafana через provisioning или API, дашборд Grafana показывает sessions и revenue graphs

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/analytics/README.md
Секции:

- Обзор: зачем аналитика DuckDB SQL queries агрегации экспорт
- DuckDB Setup: in-process OLAP engine, схема tables sessions payments reports obd_dtc thickness_measurements
- Data Loading: источники SQLite CSV JSON Parquet, процесс загрузки через loadData
- Query Examples: типовые SQL запросы sessions по дням revenue по услугам errors топ 10
- Scheduled Aggregations: ежедневная агрегация cron 2 AM, результаты в aggregations table, экспорт
- Dashboards: overview service-performance financial, API endpoints, интеграция с админ-панелью
- Export Formats: CSV JSON Excel, использование для BI tools
- Troubleshooting: DuckDB память overflow увеличить heap size, slow queries добавить indexes или filter раньше, export файл большой compression или pagination

ПРИМЕРЫ

Пример инициализация AnalyticsService

```typescript
// apps/kiosk-agent/src/analytics/analytics-init.ts
import { AnalyticsService } from './AnalyticsService.js';

const analyticsService = new AnalyticsService();

await analyticsService.initDatabase('analytics.duckdb');

await analyticsService.loadData([
  { name: 'sessions', type: 'sqlite', path: 'data/sessions.db', tableName: 'sessions' },
  { name: 'payments', type: 'sqlite', path: 'data/sessions.db', tableName: 'payments' },
  { name: 'reports', type: 'json', path: 'data/reports.json', tableName: 'reports' }
]);

console.log('Analytics database initialized');
```

Пример получение sessions report

```typescript
// apps/kiosk-agent/src/api/analytics/analytics-routes.ts
import { AnalyticsService } from '../../analytics/AnalyticsService.js';

const analyticsService = new AnalyticsService();

app.get('/api/analytics/sessions', async (req, res) => {
  const { startDate, endDate, type, status, groupBy } = req.query;

  const report = await analyticsService.getSessionsReport({
    startDate: startDate as string,
    endDate: endDate as string,
    type: type as 'THICKNESS' | 'DIAGNOSTICS',
    status: status as 'completed' | 'incomplete',
    groupBy: groupBy as 'day' | 'week' | 'month'
  });

  res.json(report);
});
```

Пример scheduled aggregation

```typescript
// apps/kiosk-agent/src/analytics/aggregation-scheduler.ts
import { ScheduledAggregations } from './ScheduledAggregations.js';
import { StructuredLogger } from '../monitoring/StructuredLogger.js';

const scheduledAggregations = new ScheduledAggregations();
const logger = StructuredLogger.getInstance().child('aggregation-scheduler');

scheduledAggregations.scheduleDailyAggregation('0 2 * * *');

logger.info('Daily aggregation scheduled at 2 AM');
```

Пример export в CSV

```typescript
// apps/kiosk-agent/src/analytics/export-example.ts
import { AnalyticsService } from './AnalyticsService.js';
import { ExportService } from './ExportService.js';

const analyticsService = new AnalyticsService();
const exportService = new ExportService();

const results = await analyticsService.executeQuery(
  'SELECT * FROM sessions WHERE created_at >= ?',
  ['2025-01-01']
);

const filePath = await exportService.exportToCsv(results, 'exports/sessions-2025.csv');

console.log(`Exported ${results.rowCount} rows to ${filePath}`);
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
DUCKDB_PATH=analytics.duckdb
ANALYTICS_MEMORY_LIMIT=4GB
AGGREGATION_CRON=0 2 * * *
EXPORT_DIR=exports/
ANALYTICS_ENABLED=true
```

DuckDB конфигурация:

- Memory limit: 4GB по умолчанию для OLAP queries, настраивается через PRAGMA memory_limit='4GB'
- Threads: auto-detect CPU cores, или фиксированное PRAGMA threads=4
- Temp directory: /tmp/duckdb для spill-to-disk если query overflow memory

БЕЗОПАСНОСТЬ

SQL injection: все query параметры через placeholders prepared statements, никогда не конкатенировать user input в SQL строки
Export файлы: сохранять в exports/ директории с permissions 600, доступ только kiosk-agent процессу, очистка старых файлов >7 дней
API authentication: endpoints /api/analytics/ требуют Bearer token или session auth для операторов, публичный доступ запрещен
PII в аналитике: sessionId и reportId можно использовать, но email phone не должны попадать в aggregations, маскирование в export файлах

МЕТРИКИ

analytics_queries_total counter labels query_type sessions|revenue|errors|trends success boolean: количество выполненных запросов
analytics_query_duration_seconds histogram: длительность SQL queries
analytics_aggregations_total counter labels success boolean: количество scheduled aggregations
analytics_export_files_total counter labels format csv|json|xlsx: количество экспортированных файлов
analytics_duckdb_memory_usage_bytes gauge: текущее использование памяти DuckDB

РИСКИ

DuckDB memory overflow: большие queries превышают memory limit. Решение: увеличить ANALYTICS_MEMORY_LIMIT или добавить WHERE фильтры для уменьшения dataset, pagination для результатов
Slow queries: сложные JOIN и агрегации медленные. Решение: создать indexes на часто используемые columns WHERE clauses, pre-aggregate данные в scheduled aggregations
Export файлы большие: CSV >100MB неудобно открывать. Решение: compression gzip, pagination по датам, экспорт только нужных columns SELECT specific
Data staleness: aggregations выполняются раз в день, real-time данные недоступны. Решение: дополнительные on-demand queries для свежих данных, или увеличить частоту aggregations

ROADMAP

Фаза 1: AnalyticsService и DuckDB базовая интеграция 1 неделя
Задачи: AnalyticsService initDatabase loadData executeQuery, QueryBuilder sessions revenue errors queries, юнит-тесты, интеграционные тесты с DuckDB
Критерии: DuckDB загружает данные из SQLite CSV JSON, SQL queries выполняются и возвращают результаты, тесты проходят

Фаза 2: Dashboards и API 1 неделя
Задачи: DashboardService overview service-performance financial dashboards, REST API endpoints sessions revenue errors dashboard, метрики и логирование
Критерии: API возвращает dashboards, Grafana визуализирует trendsChart, админ-панель показывает overview dashboard

Фаза 3: Scheduled aggregations и export 1 неделя
Задачи: ScheduledAggregations daily weekly aggregations, ExportService CSV JSON Excel export, E2E тесты full analytics flow scheduled aggregations, документация
Критерии: aggregations выполняются по расписанию, export файлы генерируются, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. AnalyticsService инициализирует DuckDB и загружает данные из SQLite CSV JSON источников
2. QueryBuilder генерирует SQL queries для sessions revenue errors trends с фильтрацией и агрегацией
3. DashboardService предоставляет overview service-performance financial dashboards через API
4. ScheduledAggregations выполняет ежедневные агрегации по cron расписанию
5. ExportService экспортирует результаты в CSV JSON Excel форматы
6. REST API endpoints sessions revenue errors dashboard export доступны
7. Метрики analytics_* экспортируются в Prometheus
8. Юнит-тесты покрытие >80% для analytics модулей
9. Интеграционные тесты duckdb-integration aggregations dashboard-api проходят
10. E2E тесты full-analytics-flow scheduled-aggregations grafana-integration проходят

ИТОГ

Промпт 11 добавляет аналитический слой через DuckDB OLAP engine для SQL queries и агрегаций операционных данных из промптов 1-6. Scheduled aggregations ежедневно обрабатывают данные за предыдущий день, DashboardService предоставляет overview financial service-performance dashboards для операторов через админ-панель промпта 12 и Grafana промпта 7. ExportService позволяет экспортировать результаты в CSV JSON Excel для внешних BI tools. Интеграция с промптами 6 7 12 обеспечивает end-to-end аналитический workflow данные агрегация визуализация insights.
