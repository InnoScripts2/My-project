# File Transfer - Seafile Integration

Долгосрочная архивация отчетов через Seafile с автоматической синхронизацией, retention policy и централизованным доступом.

## Обзор

Модуль file-transfer расширяет базовую ReportService (TTL 24 часа) долгосрочным хранением отчетов в Seafile:

- Автоматическая синхронизация отчетов в центральное облачное хранилище
- Конфигурируемая retention policy для локальных и удаленных файлов
- Web UI доступ к архивированным отчетам через Seafile
- REST API для управления архивом
- Prometheus метрики синхронизации и архивации

## Архитектура

### Модули

- **SeafileClient**: HTTP API интеграция с Seafile сервером
  - Аутентификация через токен
  - Upload/download файлов
  - Листинг директорий
  - Генерация share links
  - Batch синхронизация

- **ArchiveService**: Управление архивом отчетов
  - Архивация отчетов в Seafile
  - Локальная база metadata (SQLite)
  - Автоматическая синхронизация по расписанию
  - Фильтрация и поиск архивированных отчетов

- **RetentionPolicy**: Политика хранения данных
  - Локальная очистка файлов старше threshold
  - Удаленная очистка в Seafile
  - Exempt patterns для важных файлов
  - Автоматическое удаление после синхронизации

## Seafile Setup

### 1. Установка Seafile сервера

```bash
# Docker compose (рекомендуется)
docker run -d --name seafile \
  -p 80:80 \
  -v /opt/seafile-data:/shared \
  seafileltd/seafile:latest
```

### 2. Создание библиотеки

1. Войти в Seafile web UI
2. Создать новую библиотеку: "Kiosk Reports Archive"
3. Скопировать Library ID из URL (например: `f38d3c2e-6c90-4f6c-8f3b-4e8c3d9a6b5e`)
4. Создать пользователя для киоска: `kiosk-agent`
5. Дать права read-write на библиотеку

### 3. Получение токена

```bash
curl -d "username=kiosk-agent&password=YOUR_PASSWORD" \
  https://seafile.example.com/api2/auth-token/
```

## Configuration

### Environment Variables

```bash
# Seafile сервер
SEAFILE_SERVER_URL=https://seafile.internal
SEAFILE_USERNAME=kiosk-agent
SEAFILE_PASSWORD=secure-password
SEAFILE_LIBRARY_ID=f38d3c2e-6c90-4f6c-8f3b-4e8c3d9a6b5e

# Синхронизация
SEAFILE_SYNC_CRON=0 4 * * *  # Каждый день в 4 AM

# Retention policy
SEAFILE_LOCAL_RETENTION_DAYS=7
SEAFILE_REMOTE_RETENTION_DAYS=90
SEAFILE_AUTO_DELETE_AFTER_SYNC=true

# Share links
SEAFILE_SHARE_LINK_EXPIRATION_DAYS=7

# Reports directory
REPORTS_DIR=./reports
```

### Seafile Library Settings

- **Имя**: Kiosk Reports Archive
- **Тип**: encrypted (опционально для чувствительных данных)
- **Permissions**:
  - `kiosk-agent` user: read-write
  - `operators` group: read-only

## Archive Workflow

### 1. Архивация отчета

```typescript
import { ArchiveService } from './file-transfer/ArchiveService.js'

const archiveService = new ArchiveService()

// Архивировать отчет с share link
const result = await archiveService.archiveReport('report-id', true)

console.log('Archived:', result.remotePath)
console.log('Share link:', result.shareLink)
```

### 2. Автоматическая синхронизация

```typescript
// Запускается автоматически при инициализации
archiveService.scheduleSync('0 4 * * *')
```

### 3. Retention policy

```typescript
import { RetentionPolicy } from './file-transfer/RetentionPolicy.js'

const retentionPolicy = new RetentionPolicy()

retentionPolicy.configurePolicy({
  localRetentionDays: 7,
  remoteRetentionDays: 90,
  autoDeleteAfterSync: true,
  exemptPatterns: ['/important-.*\\.pdf$/']
})

// Применить политику
const result = await retentionPolicy.applyPolicy()
console.log(`Deleted: ${result.localDeleted} local, ${result.remoteDeleted} remote`)
```

## API Usage

### Архивировать отчет

```bash
POST /api/reports/:reportId/archive
Content-Type: application/json

{
  "shareLink": true
}
```

Response:
```json
{
  "reportId": "uuid",
  "archived": true,
  "remotePath": "reports/2025/01/15/uuid.pdf",
  "shareLink": "https://seafile.internal/f/abc123/",
  "archivedAt": "2025-01-15T10:30:00Z"
}
```

### Список архивированных отчетов

```bash
GET /api/reports/archived?type=DIAGNOSTICS&startDate=2025-01-01&limit=50
```

Response:
```json
{
  "reports": [
    {
      "reportId": "uuid",
      "type": "DIAGNOSTICS",
      "sessionId": "uuid",
      "generatedAt": "2025-01-15T10:00:00Z",
      "archivedAt": "2025-01-15T10:30:00Z",
      "remotePath": "reports/2025/01/15/uuid.pdf",
      "size": 102400
    }
  ],
  "total": 250,
  "limit": 50,
  "offset": 0
}
```

### Получить архивированный отчет

```bash
GET /api/reports/archived/:reportId
```

Response:
```json
{
  "reportId": "uuid",
  "type": "DIAGNOSTICS",
  "remotePath": "reports/2025/01/15/uuid.pdf",
  "archivedAt": "2025-01-15T10:30:00Z"
}
```

### Ручная синхронизация

```bash
POST /api/reports/sync
```

Response:
```json
{
  "syncId": "sync-1705315800000",
  "status": "running"
}
```

### Статус синхронизации

```bash
GET /api/reports/sync/:syncId
```

Response:
```json
{
  "syncId": "sync-1705315800000",
  "status": "completed",
  "result": {
    "uploaded": 10,
    "downloaded": 0,
    "deleted": 0,
    "errors": [],
    "duration": 5000
  }
}
```

## Metrics

### Prometheus Metrics

- `file_transfer_archived_reports_total{type, success}`: Количество архивированных отчетов
- `file_transfer_sync_duration_seconds`: Длительность синхронизации
- `file_transfer_sync_uploaded_files_total`: Количество загруженных файлов
- `file_transfer_sync_failed_total{reason}`: Неудачные синхронизации
- `file_transfer_retention_deleted_local_total`: Локальные файлы удалены
- `file_transfer_retention_deleted_remote_total`: Удаленные файлы удалены

### Grafana Dashboard

```promql
# Успешность архивации
rate(file_transfer_archived_reports_total{success="true"}[5m])

# Длительность синхронизации
histogram_quantile(0.95, rate(file_transfer_sync_duration_seconds_bucket[5m]))

# Неудачные синхронизации
rate(file_transfer_sync_failed_total[5m])
```

## Troubleshooting

### Seafile недоступен

**Проблема**: `Connection failed` при sync

**Решение**:
1. Проверить connectivity: `curl https://seafile.internal`
2. Проверить ENV переменные: `SEAFILE_SERVER_URL`
3. Проверить firewall/VPN
4. Проверить Seafile server logs

### Upload failed

**Проблема**: `Upload failed: 403` или `401`

**Решение**:
1. Проверить library ID корректный
2. Проверить permissions пользователя на библиотеку
3. Проверить токен не expired
4. Re-init SeafileClient с новыми credentials

### Sync медленный

**Проблема**: Синхронизация занимает >10 минут

**Решение**:
1. Оптимизировать batch size (по умолчанию все файлы)
2. Запускать sync в нерабочее время
3. Включить compression PDF перед upload
4. Проверить network bandwidth
5. Использовать incremental sync (только новые файлы)

### Disk full

**Проблема**: Seafile диск заполнен

**Решение**:
1. Мониторинг available space через API
2. Alert при <10% free space
3. Retention policy автоматическая очистка
4. Увеличить диск или архивировать старые файлы

### Files not syncing

**Проблема**: Локальные файлы не загружаются в Seafile

**Решение**:
1. Проверить REPORTS_DIR путь правильный
2. Проверить файлы существуют на диске
3. Проверить permissions на файлы
4. Проверить cron expression корректный
5. Проверить logs `[ArchiveService]`

## Security

### Credentials

- `SEAFILE_USERNAME` и `SEAFILE_PASSWORD` в ENV переменных
- Не коммитить в git
- Permissions 600 для `.env` файла

### Encrypted Library

Опционально включить шифрование библиотеки Seafile:

```bash
# При создании библиотеки выбрать "Encrypted"
# Агент хранит password в ENV
SEAFILE_LIBRARY_PASSWORD=encryption-password
```

### Share Links

- Всегда устанавливать `expirationDays` для share links
- Default 7 дней
- Не создавать permanent links

### Access Control

- Операторы: read-only доступ через Seafile web UI
- Только admin может удалять файлы
- Audit все архивации в AuditLogger

## Testing

### Unit Tests

```bash
npm test src/file-transfer/tests/unit/
```

### Integration Tests

Требуется запущенный Seafile сервер:

```bash
docker run -d -p 8080:80 seafileltd/seafile:latest
npm test src/file-transfer/tests/integration/
```

### E2E Tests

```bash
npm test src/file-transfer/tests/e2e/
```

## Roadmap

### Фаза 1: Базовая интеграция ✅
- SeafileClient init/upload/download/list/delete
- ArchiveService archiveReport/getArchivedReport
- REST API endpoints
- Unit tests

### Фаза 2: Автоматизация
- Scheduled sync по cron
- RetentionPolicy applyPolicy
- Integration tests
- Metrics и логирование

### Фаза 3: Продовая готовность
- E2E tests
- Performance optimization
- Security audit
- Документация полная

## License

Internal use only. Seafile используется согласно их лицензии.
