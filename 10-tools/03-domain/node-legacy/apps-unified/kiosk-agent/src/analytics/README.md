# Analytics System

Аналитический слой для агрегации и анализа данных киосков через DuckDB OLAP database.

## Обзор

Модуль analytics предоставляет:

- **SQL OLAP движок** на базе DuckDB для аналитических запросов
- **Агрегация данных** из операционных источников (sessions, payments, reports, OBD DTC, thickness measurements)
- **Дашборды** для операторов и бизнес-аналитики
- **Scheduled задачи** для ежедневных и еженедельных агрегаций
- **Экспорт** результатов в CSV, JSON, Excel

## Архитектура

### Модули

- **AnalyticsService** - центральный сервис для DuckDB операций
- **QueryBuilder** - построение SQL запросов
- **DashboardService** - предоставление готовых дашбордов
- **ScheduledAggregations** - автоматические агрегации по расписанию
- **ExportService** - экспорт результатов в различные форматы

### Источники данных

Аналитический слой читает данные из:

1. **SQLite базы данных** - sessions, payments, reports
2. **CSV файлы** - экспортированные данные
3. **JSON файлы** - логи и структурированные данные
4. **Parquet файлы** - сжатые колоночные данные

## DuckDB Setup

### In-Process OLAP Engine

DuckDB работает в том же процессе что и приложение, без необходимости отдельного сервера.

### Схема таблиц

```sql
-- Сессии киосков
CREATE TABLE sessions (
  session_id VARCHAR PRIMARY KEY,
  created_at TIMESTAMP,
  completed_at TIMESTAMP,
  type VARCHAR,           -- THICKNESS | DIAGNOSTICS
  status VARCHAR,         -- completed | incomplete
  device VARCHAR
);

-- Платежи
CREATE TABLE payments (
  payment_id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  amount DECIMAL,
  status VARCHAR,         -- confirmed | failed | pending
  created_at TIMESTAMP,
  confirmed_at TIMESTAMP
);

-- Отчёты
CREATE TABLE reports (
  report_id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  type VARCHAR,
  generated_at TIMESTAMP,
  delivered BOOLEAN
);

-- OBD коды ошибок
CREATE TABLE obd_dtc (
  id INTEGER PRIMARY KEY,
  session_id VARCHAR,
  dtc_code VARCHAR,
  description VARCHAR,
  severity VARCHAR,       -- high | medium | low
  occurred_at TIMESTAMP
);

-- Измерения толщиномера
CREATE TABLE thickness_measurements (
  id INTEGER PRIMARY KEY,
  session_id VARCHAR,
  zone VARCHAR,
  value DECIMAL,
  measured_at TIMESTAMP
);
```

## Data Loading

### Загрузка из SQLite

```typescript
await analyticsService.loadData([
  {
    name: 'sessions',
    type: 'sqlite',
    path: 'data/sessions.db',
    tableName: 'sessions'
  }
]);
```

### Загрузка из CSV

```typescript
await analyticsService.loadData([
  {
    name: 'sessions',
    type: 'csv',
    path: 'data/sessions.csv',
    tableName: 'sessions'
  }
]);
```

### Загрузка из JSON

```typescript
await analyticsService.loadData([
  {
    name: 'sessions',
    type: 'json',
    path: 'data/sessions.json',
    tableName: 'sessions'
  }
]);
```

## Query Examples

### Сессии по дням

```sql
SELECT
  DATE_TRUNC('day', created_at) AS period,
  COUNT(*) AS total_sessions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN type = 'THICKNESS' THEN 1 ELSE 0 END) AS thickness_count,
  SUM(CASE WHEN type = 'DIAGNOSTICS' THEN 1 ELSE 0 END) AS diagnostics_count
FROM sessions
WHERE created_at >= '2025-01-01' AND created_at <= '2025-01-31'
GROUP BY period
ORDER BY period ASC;
```

### Выручка по услугам

```sql
SELECT
  DATE_TRUNC('day', p.created_at) AS period,
  SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END) AS total_revenue,
  SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'THICKNESS' THEN p.amount ELSE 0 END) AS thickness_revenue,
  SUM(CASE WHEN p.status = 'confirmed' AND s.type = 'DIAGNOSTICS' THEN p.amount ELSE 0 END) AS diagnostics_revenue
FROM payments p
LEFT JOIN sessions s ON p.session_id = s.session_id
WHERE p.created_at >= '2025-01-01' AND p.created_at <= '2025-01-31'
GROUP BY period
ORDER BY period ASC;
```

### Топ-10 ошибок OBD

```sql
SELECT
  dtc_code AS code,
  description,
  COUNT(*) AS count,
  severity
FROM obd_dtc
WHERE occurred_at >= '2025-01-01' AND occurred_at <= '2025-01-31'
GROUP BY dtc_code, description, severity
ORDER BY count DESC
LIMIT 10;
```

## Scheduled Aggregations

### Ежедневная агрегация

Выполняется каждый день в 2:00 AM:

```typescript
import { ScheduledAggregations } from './ScheduledAggregations.js';

const scheduledAggregations = new ScheduledAggregations(
  analyticsService,
  exportService
);

scheduledAggregations.scheduleDailyAggregation('0 2 * * *');
```

Процесс:

1. Загрузка данных за предыдущий день
2. Агрегация sessions, revenue, errors
3. Сохранение результатов в `data/aggregations/aggregation-YYYY-MM-DD.json`
4. Экспорт в CSV для Grafana/Excel

### Еженедельный отчёт

Выполняется каждый понедельник в 3:00 AM:

```typescript
scheduledAggregations.scheduleWeeklyReport('0 3 * * 1');
```

## Dashboards

### Overview Dashboard

Общая статистика за период:

```typescript
const dashboard = await dashboardService.getOverviewDashboard({
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

// Результат:
{
  totalSessions: 450,
  totalRevenue: 180000,
  activeDevices: 2,
  avgSessionDuration: 420,
  topErrors: [
    { code: 'P0420', count: 15 }
  ],
  trendsChart: [
    { date: '2025-01-15', sessions: 45, revenue: 18000 }
  ]
}
```

### Service Performance Dashboard

Производительность каждой услуги:

```typescript
const dashboard = await dashboardService.getServicePerformanceDashboard({
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

// Результат:
{
  thickness: {
    totalSessions: 250,
    avgDuration: 380,
    revenue: 87500,
    topMeasurements: [...]
  },
  diagnostics: {
    totalSessions: 200,
    avgDuration: 470,
    revenue: 96000,
    topDtcCodes: [...]
  }
}
```

### Financial Dashboard

Финансовые метрики:

```typescript
const dashboard = await dashboardService.getFinancialDashboard({
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

// Результат:
{
  totalRevenue: 183500,
  revenueByService: { THICKNESS: 87500, DIAGNOSTICS: 96000 },
  paymentSuccess: { total: 450, confirmed: 440, failed: 10, rate: 97.8 },
  avgTransactionValue: 408,
  revenueGrowth: 15.2
}
```

## Export Formats

### CSV Export

```typescript
const results = await analyticsService.executeQuery('SELECT * FROM sessions');
const filePath = await exportService.exportToCsv(results, 'sessions-2025.csv');
```

### JSON Export

```typescript
const filePath = await exportService.exportToJson(results, 'sessions-2025.json');
```

### Excel Export

```typescript
const filePath = await exportService.exportToExcel(results, 'sessions-2025.xlsx');
```

Функции Excel экспорта:

- Auto-fit column widths
- Bold header row с серым фоном
- Auto-filter на всех колонках
- Ограничение ширины колонок до 50 символов

## REST API

### GET /api/analytics/sessions

Получить отчёт по сессиям.

Query params:
- `startDate` (required) - ISO8601 дата начала
- `endDate` (required) - ISO8601 дата конца
- `type` (optional) - THICKNESS | DIAGNOSTICS
- `status` (optional) - completed | incomplete
- `groupBy` (optional) - day | week | month (default: day)

Response:

```json
{
  "data": [
    {
      "period": "2025-01-15",
      "totalSessions": 45,
      "completedSessions": 40,
      "incompleteSessions": 5,
      "byType": { "THICKNESS": 25, "DIAGNOSTICS": 20 },
      "avgDuration": 450
    }
  ],
  "total": 30,
  "duration": 120
}
```

### GET /api/analytics/revenue

Получить отчёт по выручке.

Query params:
- `startDate` (required)
- `endDate` (required)
- `groupBy` (optional) - day | week | month | service (default: day)

### GET /api/analytics/errors

Получить отчёт по ошибкам.

Query params:
- `startDate` (required)
- `endDate` (required)
- `device` (optional) - obd | thickness
- `severity` (optional) - high | medium | low
- `limit` (optional) - количество топ ошибок (default: 100)

### GET /api/analytics/dashboard/overview

Получить overview dashboard.

### GET /api/analytics/dashboard/service-performance

Получить service performance dashboard.

### GET /api/analytics/dashboard/financial

Получить financial dashboard.

### POST /api/analytics/export

Экспортировать результаты запроса.

Request body:

```json
{
  "query": "SELECT * FROM sessions WHERE created_at >= '2025-01-01'",
  "format": "csv"
}
```

Response:

```json
{
  "filePath": "exports/export-2025-01-15T10-30-00.csv",
  "rowCount": 450,
  "size": 102400
}
```

## Metrics

### Prometheus Metrics

- `analytics_queries_total` - количество выполненных запросов (labels: query_type, success)
- `analytics_query_duration_seconds` - длительность SQL queries (labels: query_type)
- `analytics_aggregations_total` - количество scheduled aggregations (labels: success)
- `analytics_export_files_total` - количество экспортированных файлов (labels: format)
- `analytics_export_duration_seconds` - длительность export операций (labels: format)

## Troubleshooting

### DuckDB memory overflow

**Проблема**: большие queries превышают memory limit.

**Решение**:

1. Увеличить `ANALYTICS_MEMORY_LIMIT` в .env
2. Добавить WHERE фильтры для уменьшения dataset
3. Использовать pagination для результатов

```typescript
// Установить memory limit
await conn.run("PRAGMA memory_limit='8GB'");
```

### Slow queries

**Проблема**: сложные JOIN и агрегации медленные.

**Решение**:

1. Создать indexes на часто используемые columns:

```sql
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_payments_session_id ON payments(session_id);
```

2. Pre-aggregate данные в scheduled aggregations
3. Использовать более широкий groupBy (week вместо day)

### Export файлы большие

**Проблема**: CSV >100MB неудобно открывать.

**Решение**:

1. Compression:

```typescript
// TODO: добавить gzip compression
```

2. Pagination по датам
3. Экспортировать только нужные columns: `SELECT specific columns`

### Data staleness

**Проблема**: aggregations выполняются раз в день, real-time данные недоступны.

**Решение**:

1. On-demand queries для свежих данных через API
2. Увеличить частоту aggregations (каждые 6 часов)
3. Использовать прямые запросы к SQLite для real-time

## Configuration

### Environment Variables

```env
# DuckDB
DUCKDB_PATH=analytics.duckdb
ANALYTICS_MEMORY_LIMIT=4GB

# Aggregations
AGGREGATION_CRON=0 2 * * *
AGGREGATION_DIR=data/aggregations

# Exports
EXPORT_DIR=exports/
EXPORT_CLEANUP_DAYS=7

# Enable/Disable
ANALYTICS_ENABLED=true
```

## Integration

### С промптом 7 (Monitoring/Grafana)

Grafana может визуализировать trendsChart и другие метрики:

1. Экспортировать aggregations в CSV
2. Импортировать в Grafana через CSV datasource
3. Создать dashboards с graphs и tables

### С промптом 12 (Админ-панель)

Админ-панель запрашивает дашборды через API:

```typescript
// В админ-панели
const overview = await fetch('/api/analytics/dashboard/overview?startDate=...&endDate=...')
  .then(r => r.json());

// Отображать trendsChart, topErrors, и т.д.
```

## Security

### SQL Injection

Все query параметры через prepared statements:

```typescript
// НЕ ПРАВИЛЬНО
const sql = `SELECT * FROM sessions WHERE type = '${userInput}'`;

// ПРАВИЛЬНО
const sql = 'SELECT * FROM sessions WHERE type = ?';
const result = await analyticsService.executeQuery(sql, [userInput]);
```

### Export Files

- Сохранять в `exports/` с permissions 600
- Очистка старых файлов >7 дней
- Доступ только для kiosk-agent процесса

### API Authentication

Endpoints `/api/analytics/` требуют Bearer token или session auth.

## Testing

### Unit Tests

```bash
npm test -- src/analytics/tests/AnalyticsService.test.ts
npm test -- src/analytics/tests/QueryBuilder.test.ts
npm test -- src/analytics/tests/ExportService.test.ts
```

### Integration Tests

```bash
npm test -- src/analytics/tests/integration/duckdb-integration.test.ts
```

### E2E Tests

```bash
npm test -- src/analytics/tests/e2e/full-analytics-flow.test.ts
```

## Development

### Local Setup

```bash
# Установить зависимости
npm install

# Инициализировать базу данных
npm run analytics:init

# Запустить тесты
npm test
```

### Example Usage

```typescript
import { AnalyticsService } from './analytics/AnalyticsService.js';
import { DashboardService } from './analytics/DashboardService.js';

// Инициализация
const analytics = new AnalyticsService();
await analytics.initDatabase('data/analytics.duckdb');

// Загрузка данных
await analytics.loadData([
  { name: 'sessions', type: 'sqlite', path: 'data/sessions.db', tableName: 'sessions' }
]);

// Получить отчёт
const report = await analytics.getSessionsReport({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  groupBy: 'day'
});

console.log(report);
```

## Roadmap

- [ ] Parquet support для сжатия больших datasets
- [ ] Incremental loading для больших SQLite databases
- [ ] Real-time streaming analytics через WebSockets
- [ ] Machine learning интеграция для прогнозирования
- [ ] External BI tools поддержка (Tableau, PowerBI)
- [ ] Data warehousing с центральным хранилищем
