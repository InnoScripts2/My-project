# Промпт 13 инвентаризация ОС и сеть

ЦЕЛЬ
Реализовать системный мониторинг киосков через osquery SQL-based инвентаризацию hardware OS version network interfaces processes installed software, scheduled queries cron для периодического сбора данных, inventory reporting в центральный сервер или локальное хранилище, anomaly detection выявление unexpected processes network connections suspicious files, интеграция с промптом 7 monitoring для system metrics и промптом 8 security Wazuh для security context. Цель: полная видимость системного состояния киосков, быстрое обнаружение изменений hardware software processes, автоматическая детекция аномалий, соответствие compliance требованиям.

КОНТЕКСТ
Киоски работают на Windows или Linux, содержат критичные данные sessions payments reports, подключены к устройствам OBD адаптер толщиномер, выполняют платежи через интернет. Операторы нуждаются в инвентаризации: список всех установленных программ для compliance, активные процессы для выявления malware, сетевые соединения для audit неожиданных connections, hardware информация CPU RAM disk для capacity planning, OS patches уровень для security assessment. Без инвентаризации операторы не знают какой софт установлен, какие процессы запущены, какие порты открыты. osquery предоставляет SQL интерфейс для системных данных: таблицы processes listening_ports installed_programs system_info interface_addresses, queries выполняются локально без агента только standalone daemon, результаты export в JSON или отправка в remote server через TLS. Интеграция: OsqueryService выполняет scheduled queries через cron, сохраняет results в локальную БД или отправляет в remote endpoint, AnomalyDetector сравнивает текущие results с baseline для выявления новых processes или connections, промпт 7 MetricsService собирает osquery_queries_executed_total для monitoring, промпт 8 WazuhAgent получает inventory данные для correlation с security events.

ГРАНИЦЫ
Внутри: OsqueryService инициализация osqueryd daemon, query execution через osqueryi CLI или socket API, scheduled queries cron definitions с периодичностью, InventoryCollector агрегация results hardware software network processes, AnomalyDetector baseline создание новые процессы detected, reporting отправка inventory в remote server или локальное хранилище, REST API endpoints для получения inventory и anomalies. Вне: vulnerability scanning CVE detection делает промпт 8 Wazuh, log aggregation centralized logging делает промпт 7 structured logger, FIM file integrity monitoring делает Wazuh не osquery, patch management автоматическое обновление не в scope. Интеграция: промпт 7 monitoring собирает метрики osquery_queries_executed_total osquery_anomalies_detected_total, промпт 8 Wazuh получает inventory данные через API или file export для correlation, промпт 12 admin-console показывает inventory dashboard и anomalies alerts.

АРХИТЕКТУРА

МОДУЛЬ OsqueryService
Файл apps/kiosk-agent/src/os-inventory/OsqueryService.ts
Класс OsqueryService методы:

- initOsquery configPath string returns Promise void
- executeQuery sql string returns Promise QueryResult
- scheduleQueries queries array ScheduledQuery returns void
- getQueryResults queryName string returns Promise QueryResult
- exportResults format json|csv returns Promise string filePath

QueryResult interface:

- rows array object результаты таблицы osquery
- columns array string имена колонок
- duration number ms время выполнения
- timestamp string ISO8601 когда query выполнен

ScheduledQuery interface:

- name string уникальное имя query например hardware_inventory
- query string SQL запрос SELECT FROM osquery tables
- interval number seconds частота выполнения
- snapshot boolean true для one-time data false для diffs

Инициализация osquery:

- Windows: установить osquery MSI пакет из официального репозитория, запустить osqueryd как Windows Service
- Linux: установить osquery через apt yum или скачать binary, запустить osqueryd daemon systemd service
- Config файл osquery.conf JSON формат:

```json
{
  "options": {
    "config_plugin": "filesystem",
    "logger_plugin": "filesystem",
    "logger_path": "logs/osquery/",
    "database_path": "data/osquery/",
    "utc": true
  },
  "schedule": {
    "hardware_inventory": {
      "query": "SELECT * FROM system_info;",
      "interval": 3600,
      "snapshot": true
    },
    "installed_programs": {
      "query": "SELECT name, version, install_date FROM programs;",
      "interval": 86400,
      "snapshot": true
    },
    "active_processes": {
      "query": "SELECT pid, name, path, cmdline FROM processes;",
      "interval": 60,
      "snapshot": false
    },
    "listening_ports": {
      "query": "SELECT pid, port, protocol, address FROM listening_ports;",
      "interval": 300,
      "snapshot": false
    }
  }
}
```

executeQuery процесс:

- Вызов osqueryi CLI: `osqueryi --json "SELECT * FROM system_info;"`
- Парсинг stdout JSON результата
- Возврат QueryResult с rows и columns

Альтернатива: использовать osquery Thrift API или Extension socket для programmatic access без CLI

МОДУЛЬ InventoryCollector
Файл apps/kiosk-agent/src/os-inventory/InventoryCollector.ts
Класс InventoryCollector методы:

- collectHardwareInventory returns Promise HardwareInventory
- collectSoftwareInventory returns Promise SoftwareInventory
- collectNetworkInventory returns Promise NetworkInventory
- collectProcessInventory returns Promise ProcessInventory
- collectFullInventory returns Promise FullInventory

HardwareInventory interface:

- hostname string
- cpu object {model: string, cores: number, frequency: number}
- memory object {total: number, available: number}
- disks array {device: string, size: number, freeSpace: number}
- osInfo object {name: string, version: string, arch: string}

SoftwareInventory interface:

- installedPrograms array {name: string, version: string, installDate: string}
- runningServices array {name: string, status: string}

NetworkInventory interface:

- interfaces array {name: string, ipAddress: string, macAddress: string, status: string}
- listeningPorts array {port: number, protocol: string, pid: number, processName: string}
- activeConnections array {localAddress: string, remoteAddress: string, state: string}

ProcessInventory interface:

- processes array {pid: number, name: string, path: string, cmdline: string, user: string}

FullInventory interface включает все четыре типа плюс timestamp collectedAt

collectHardwareInventory процесс:

```typescript
async collectHardwareInventory(): Promise<HardwareInventory> {
  const systemInfoResult = await this.osqueryService.executeQuery('SELECT * FROM system_info;');
  const cpuTimeResult = await this.osqueryService.executeQuery('SELECT * FROM cpu_info;');
  const memoryResult = await this.osqueryService.executeQuery('SELECT * FROM memory_info;');
  const disksResult = await this.osqueryService.executeQuery('SELECT * FROM mounts;');

  return {
    hostname: systemInfoResult.rows[0].hostname,
    cpu: {
      model: cpuTimeResult.rows[0].cpu_brand,
      cores: cpuTimeResult.rows.length,
      frequency: cpuTimeResult.rows[0].cpu_logical_cores
    },
    memory: {
      total: parseInt(memoryResult.rows[0].memory_total),
      available: parseInt(memoryResult.rows[0].memory_free)
    },
    disks: disksResult.rows.map(row => ({
      device: row.device,
      size: parseInt(row.blocks) * parseInt(row.blocks_size),
      freeSpace: parseInt(row.blocks_available) * parseInt(row.blocks_size)
    })),
    osInfo: {
      name: systemInfoResult.rows[0].os_name,
      version: systemInfoResult.rows[0].os_version,
      arch: systemInfoResult.rows[0].cpu_type
    }
  };
}
```

collectSoftwareInventory процесс:

```typescript
async collectSoftwareInventory(): Promise<SoftwareInventory> {
  const programsResult = await this.osqueryService.executeQuery('SELECT name, version, install_date FROM programs;');
  const servicesResult = await this.osqueryService.executeQuery('SELECT name, status FROM services;');

  return {
    installedPrograms: programsResult.rows.map(row => ({
      name: row.name,
      version: row.version,
      installDate: row.install_date
    })),
    runningServices: servicesResult.rows.map(row => ({
      name: row.name,
      status: row.status
    }))
  };
}
```

МОДУЛЬ AnomalyDetector
Файл apps/kiosk-agent/src/os-inventory/AnomalyDetector.ts
Класс AnomalyDetector методы:

- createBaseline inventory FullInventory returns Promise void
- detectAnomalies current FullInventory returns Promise Anomalies
- getBaseline returns Promise FullInventory or null

Anomalies interface:

- newProcesses array {pid, name, path}: процессы не существовавшие в baseline
- unexpectedPorts array {port, pid, processName}: открытые порты не в whitelist
- newSoftware array {name, version}: программы установленные после baseline
- suspiciousConnections array {remoteAddress, processName}: соединения к неизвестным IP

Логика createBaseline:

- Сохранить текущий inventory в файл baseline.json или БД baseline_inventory table
- Timestamp baseline creation для tracking age

Логика detectAnomalies:

```typescript
async detectAnomalies(current: FullInventory): Promise<Anomalies> {
  const baseline = await this.getBaseline();
  if (!baseline) {
    throw new Error('Baseline not created');
  }

  const baselineProcessNames = new Set(baseline.processInventory.processes.map(p => p.name));
  const newProcesses = current.processInventory.processes.filter(p => !baselineProcessNames.has(p.name));

  const whitelistedPorts = new Set([80, 443, 8080]);
  const unexpectedPorts = current.networkInventory.listeningPorts.filter(p => !whitelistedPorts.has(p.port));

  const baselineSoftwareNames = new Set(baseline.softwareInventory.installedPrograms.map(s => s.name));
  const newSoftware = current.softwareInventory.installedPrograms.filter(s => !baselineSoftwareNames.has(s.name));

  const suspiciousConnections = current.networkInventory.activeConnections.filter(c => {
    // Detect connections to non-whitelisted IPs or suspicious domains
    return !c.remoteAddress.startsWith('192.168.') && !c.remoteAddress.startsWith('10.');
  });

  return { newProcesses, unexpectedPorts, newSoftware, suspiciousConnections };
}
```

МОДУЛЬ InventoryReporter
Файл apps/kiosk-agent/src/os-inventory/InventoryReporter.ts
Класс InventoryReporter методы:

- reportToRemoteServer inventory FullInventory endpoint string returns Promise ReportResult
- saveToLocalStorage inventory FullInventory returns Promise string filePath
- scheduleReporting cronExpression string returns void

ReportResult interface:

- success boolean
- statusCode number HTTP status
- message string
- timestamp string

Логика reportToRemoteServer:

```typescript
async reportToRemoteServer(inventory: FullInventory, endpoint: string): Promise<ReportResult> {
  const response = await axios.post(endpoint, inventory, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  return {
    success: response.status === 200,
    statusCode: response.status,
    message: response.data.message,
    timestamp: new Date().toISOString()
  };
}
```

Логика saveToLocalStorage:

- Сохранить inventory в файл inventory-YYYY-MM-DD-HH-mm-ss.json директория data/inventory/
- Retention policy: удалять файлы старше 30 дней для экономии disk space

scheduleReporting через node-cron:

```typescript
cron.schedule('0 */6 * * *', async () => {
  const inventory = await inventoryCollector.collectFullInventory();
  await inventoryReporter.reportToRemoteServer(inventory, process.env.INVENTORY_ENDPOINT);
});
```

МОДУЛЬ OsqueryScheduler
Файл apps/kiosk-agent/src/os-inventory/OsqueryScheduler.ts
Класс OsqueryScheduler методы:

- scheduleQuery query ScheduledQuery returns void
- runScheduledQuery queryName string returns Promise QueryResult
- getScheduledQueries returns array ScheduledQuery
- removeScheduledQuery queryName string returns void

Логика scheduleQuery:

```typescript
scheduleQuery(query: ScheduledQuery): void {
  const cronExpression = this.intervalToCron(query.interval);

  cron.schedule(cronExpression, async () => {
    const result = await this.osqueryService.executeQuery(query.query);
    await this.saveQueryResult(query.name, result);

    if (!query.snapshot) {
      // Detect diffs for non-snapshot queries
      const previousResult = await this.getPreviousResult(query.name);
      const diffs = this.computeDiffs(previousResult, result);
      if (diffs.length > 0) {
        await this.handleDiffs(query.name, diffs);
      }
    }
  });
}
```

intervalToCron процесс:

- 60 секунд: `* * * * *` каждую минуту
- 300 секунд: `*/5 * * * *` каждые 5 минут
- 3600 секунд: `0 * * * *` каждый час
- 86400 секунд: `0 0 * * *` каждый день

REST API

GET /api/os-inventory/hardware
Получить hardware inventory
Ответ: 200 OK application/json

```json
{
  "hostname": "kiosk-001",
  "cpu": {"model": "Intel Core i5-10400", "cores": 6, "frequency": 2900},
  "memory": {"total": 16777216, "available": 8388608},
  "disks": [{"device": "/dev/sda", "size": 500000000000, "freeSpace": 100000000000}],
  "osInfo": {"name": "Windows", "version": "10.0.19045", "arch": "x86_64"}
}
```

GET /api/os-inventory/software
Получить software inventory
Ответ: 200 OK application/json

```json
{
  "installedPrograms": [{"name": "Node.js", "version": "20.10.0", "installDate": "2025-01-01"}],
  "runningServices": [{"name": "kiosk-agent", "status": "running"}]
}
```

GET /api/os-inventory/network
Получить network inventory
Ответ: 200 OK application/json

```json
{
  "interfaces": [{"name": "eth0", "ipAddress": "192.168.1.100", "macAddress": "AA:BB:CC:DD:EE:FF", "status": "up"}],
  "listeningPorts": [{"port": 8080, "protocol": "tcp", "pid": 1234, "processName": "node"}],
  "activeConnections": [{"localAddress": "192.168.1.100:8080", "remoteAddress": "192.168.1.200:54321", "state": "ESTABLISHED"}]
}
```

GET /api/os-inventory/processes
Получить process inventory
Ответ: 200 OK application/json

```json
{
  "processes": [{"pid": 1234, "name": "node", "path": "/usr/bin/node", "cmdline": "node /app/index.js", "user": "kiosk"}]
}
```

GET /api/os-inventory/full
Получить full inventory hardware software network processes
Ответ: 200 OK application/json включает все четыре типа

POST /api/os-inventory/baseline
Создать baseline для anomaly detection
Ответ: 201 Created

GET /api/os-inventory/anomalies
Получить detected anomalies
Ответ: 200 OK application/json

```json
{
  "newProcesses": [{"pid": 5678, "name": "unknown.exe", "path": "C:\\Temp\\unknown.exe"}],
  "unexpectedPorts": [{"port": 4444, "pid": 5678, "processName": "unknown.exe"}],
  "newSoftware": [{"name": "Suspicious Software", "version": "1.0"}],
  "suspiciousConnections": [{"remoteAddress": "1.2.3.4:4444", "processName": "unknown.exe"}]
}
```

POST /api/os-inventory/report
Отправить inventory на remote server
Запрос: application/json {endpoint: string}
Ответ: 200 OK application/json

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Inventory reported successfully",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/os-inventory/tests/

- OsqueryService.test.ts: executeQuery возвращает QueryResult с rows, scheduleQueries регистрирует cron jobs, exportResults сохраняет JSON файл
- InventoryCollector.test.ts: collectHardwareInventory возвращает HardwareInventory с hostname cpu memory, collectSoftwareInventory возвращает installedPrograms, collectNetworkInventory возвращает interfaces listeningPorts
- AnomalyDetector.test.ts: createBaseline сохраняет baseline.json, detectAnomalies возвращает newProcesses если новый процесс появился, unexpectedPorts если порт не в whitelist
- InventoryReporter.test.ts: reportToRemoteServer вызывает axios.post с inventory, saveToLocalStorage создает файл inventory-YYYY-MM-DD.json

Интеграционные тесты apps/kiosk-agent/src/os-inventory/tests/integration/

- osquery-integration.test.ts: инициализация osquery daemon, выполнение реального query SELECT FROM system_info, проверка rows содержат hostname cpu_brand, scheduled query active_processes выполняется и results сохраняются
- anomaly-detection.test.ts: создание baseline с 10 процессами, запуск нового процесса test-process.exe, detectAnomalies возвращает newProcesses содержит test-process.exe
- inventory-reporting.test.ts: collectFullInventory возвращает полный inventory, reportToRemoteServer отправляет на mock endpoint, проверка payload содержит hardware software network processes

E2E тесты apps/kiosk-agent/src/os-inventory/tests/e2e/

- full-inventory-flow.test.ts: osquery daemon запущен, scheduled queries выполняются каждые 60s, collectFullInventory собирает данные, reportToRemoteServer отправляет inventory, GET /api/os-inventory/full возвращает inventory
- anomaly-detection-flow.test.ts: создание baseline через POST /api/os-inventory/baseline, установка нового ПО или запуск процесса, GET /api/os-inventory/anomalies возвращает newSoftware или newProcesses, alert_triggered event отправляется в WebSocket
- wazuh-integration.test.ts: InventoryReporter отправляет inventory в Wazuh API endpoint, Wazuh получает inventory данные, correlation с security events выявляет suspicious process

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/os-inventory/README.md
Секции:

- Обзор: osquery SQL-based системный мониторинг, инвентаризация hardware software network processes
- osquery Setup: установка Windows MSI или Linux apt yum, конфигурация osquery.conf schedule queries, запуск osqueryd daemon
- Scheduled Queries: hardware_inventory каждый час snapshot, installed_programs каждый день snapshot, active_processes каждую минуту diffs, listening_ports каждые 5 минут diffs
- Inventory Collection: InventoryCollector методы hardware software network processes, REST API endpoints
- Anomaly Detection: AnomalyDetector baseline creation, detection новых процессов портов софта, alerts integration
- Reporting: InventoryReporter remote server отправка или local storage, cron каждые 6 часов
- Integration: промпт 7 monitoring метрики osquery_queries_executed_total, промпт 8 Wazuh inventory correlation, промпт 12 admin-console inventory dashboard
- Troubleshooting: osquery daemon not running проверить systemd service или Windows Service, query timeout увеличить timeout parameter, inventory файлы большие retention policy 30 дней, anomaly detection false positives whitelist добавить

ПРИМЕРЫ

Пример инициализация OsqueryService

```typescript
// apps/kiosk-agent/src/os-inventory/osquery-init.ts
import { OsqueryService } from './OsqueryService.js';

const osqueryService = new OsqueryService();

await osqueryService.initOsquery('config/osquery.conf');

const systemInfo = await osqueryService.executeQuery('SELECT * FROM system_info;');
console.log('Hostname:', systemInfo.rows[0].hostname);
```

Пример collect full inventory

```typescript
// apps/kiosk-agent/src/os-inventory/collect-inventory.ts
import { InventoryCollector } from './InventoryCollector.js';

const inventoryCollector = new InventoryCollector();

const fullInventory = await inventoryCollector.collectFullInventory();

console.log('Hardware:', fullInventory.hardwareInventory);
console.log('Software:', fullInventory.softwareInventory);
console.log('Network:', fullInventory.networkInventory);
console.log('Processes:', fullInventory.processInventory);
```

Пример anomaly detection

```typescript
// apps/kiosk-agent/src/os-inventory/detect-anomalies.ts
import { AnomalyDetector } from './AnomalyDetector.js';
import { InventoryCollector } from './InventoryCollector.js';

const anomalyDetector = new AnomalyDetector();
const inventoryCollector = new InventoryCollector();

const current = await inventoryCollector.collectFullInventory();
const anomalies = await anomalyDetector.detectAnomalies(current);

if (anomalies.newProcesses.length > 0) {
  console.log('New processes detected:', anomalies.newProcesses);
}

if (anomalies.unexpectedPorts.length > 0) {
  console.log('Unexpected ports detected:', anomalies.unexpectedPorts);
}
```

Пример scheduled reporting

```typescript
// apps/kiosk-agent/src/os-inventory/reporting-scheduler.ts
import { InventoryReporter } from './InventoryReporter.js';

const inventoryReporter = new InventoryReporter();

inventoryReporter.scheduleReporting('0 */6 * * *'); // Каждые 6 часов

console.log('Inventory reporting scheduled');
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
OSQUERY_CONFIG_PATH=config/osquery.conf
OSQUERY_DATABASE_PATH=data/osquery/
OSQUERY_LOGGER_PATH=logs/osquery/
INVENTORY_ENDPOINT=https://central-server.example.com/api/inventory
INVENTORY_RETENTION_DAYS=30
ANOMALY_DETECTION_ENABLED=true
BASELINE_FILE=data/baseline.json
```

osquery.conf дополнительные опции:

- logger_plugin: filesystem или tls для remote logging
- config_refresh: 60 для динамической перезагрузки config
- disable_events: false для event-based queries
- host_identifier: hostname для уникальной идентификации киоска

БЕЗОПАСНОСТЬ

osquery daemon permissions: запуск под непривилегированным пользователем osquery, доступ только к необходимым системным таблицам, чтение osquery.conf требует root admin но запись запрещена для kiosk-agent
Inventory data exposure: hardware software network процессы могут содержать PII usernames. Решение: маскировать username поля или не отправлять в remote server, шифрование inventory при передаче TLS
Anomaly detection false positives: легитимные процессы могут быть помечены как anomalies. Решение: whitelist известных процессов портов, operator review через admin-console перед action
Remote reporting authentication: INVENTORY_ENDPOINT требует auth token. Решение: Bearer token в headers или mutual TLS certificates

МЕТРИКИ

osquery_queries_executed_total counter labels query_name success boolean: количество выполненных osquery queries
osquery_query_duration_seconds histogram: длительность osquery queries
inventory_collections_total counter labels type hardware|software|network|processes: количество inventory collections
inventory_anomalies_detected_total counter labels type newProcesses|unexpectedPorts|newSoftware: количество detected anomalies
inventory_reports_sent_total counter labels endpoint success boolean: количество отправленных inventory reports

РИСКИ

osquery performance impact: тяжелые queries могут нагрузить CPU disk. Решение: увеличить interval для неcritical queries, использовать snapshot true для one-time data вместо diffs
Anomaly detection false positives: легитимные изменения помечаются как anomalies. Решение: whitelist процессов портов софта, operator review, baseline update периодически
Baseline staleness: baseline устаревает после легитимных изменений software patches. Решение: periodic baseline refresh каждые 30 дней или после major updates, operator-triggered baseline reset
Inventory data size: full inventory может быть >1MB на киоск. Решение: compression gzip перед отправкой, partial inventory только diffs для scheduled reporting, retention policy 30 дней

ROADMAP

Фаза 1: OsqueryService и inventory collection 1 неделя
Задачи: OsqueryService initOsquery executeQuery scheduleQueries, InventoryCollector hardware software network processes, REST API endpoints inventory, юнит-тесты, интеграционные тесты osquery queries
Критерии: osquery daemon запущен, queries выполняются, inventory collection возвращает данные, API endpoints работают

Фаза 2: Anomaly detection и baseline 1 неделя
Задачи: AnomalyDetector createBaseline detectAnomalies, REST API anomalies endpoint, integration с промптом 7 alerts, метрики osquery_anomalies_detected_total, интеграционные тесты anomaly detection
Критерии: baseline создается, anomalies детектятся новые процессы порты софт, alerts отправляются в monitoring

Фаза 3: Reporting и Wazuh integration 1 неделя
Задачи: InventoryReporter remote server reporting local storage, scheduled reporting cron, интеграция с Wazuh API endpoint, E2E тесты full inventory flow anomaly detection Wazuh integration, документация
Критерии: inventory отправляется в remote server каждые 6 часов, Wazuh получает inventory, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. OsqueryService инициализирует osquery daemon и выполняет SQL queries
2. InventoryCollector собирает hardware software network processes inventory
3. AnomalyDetector создает baseline и детектирует новые процессы порты софт
4. InventoryReporter отправляет inventory в remote server или сохраняет локально
5. Scheduled queries выполняются по cron расписанию hardware_inventory installed_programs active_processes listening_ports
6. REST API endpoints hardware software network processes full anomalies baseline report доступны
7. Метрики osquery_* экспортируются в Prometheus
8. Интеграция с промптом 7 monitoring алерты anomalies_detected
9. Интеграция с промптом 8 Wazuh inventory correlation
10. Интеграция с промптом 12 admin-console inventory dashboard
11. Юнит-тесты покрытие >80%
12. Интеграционные тесты osquery-integration anomaly-detection inventory-reporting проходят
13. E2E тесты full-inventory-flow anomaly-detection-flow wazuh-integration проходят

ИТОГ

Промпт 13 добавляет системный мониторинг киосков через osquery SQL-based инвентаризацию hardware OS version network interfaces processes installed software. Scheduled queries cron периодически собирают данные, InventoryCollector агрегирует inventory, AnomalyDetector выявляет новые процессы порты софт, InventoryReporter отправляет в remote server или локальное хранилище. Интеграция с промптом 7 monitoring обеспечивает metrics и alerts, промпт 8 Wazuh получает inventory для correlation с security events, промпт 12 admin-console показывает inventory dashboard. Решение обеспечивает полную видимость системного состояния киосков и автоматическое обнаружение аномалий.
