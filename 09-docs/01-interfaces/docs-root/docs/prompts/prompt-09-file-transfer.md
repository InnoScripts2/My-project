# Промпт 9 передача файлов отчетов

ЦЕЛЬ
Реализовать опциональную долгосрочную архивацию отчетов через Seafile синхронизацию между киосками и центральным сервером хранения, доступ к отчетам через web UI, автоматическая синхронизация по расписанию, конфигурируемая retention policy, интеграция с промптом 6 ReportService для расширения локального TTL 24h до длительного хранения недели месяцы. Цель: центральный архив всех отчетов, доступность для клиентов и операторов, резервное копирование, compliance с требованиями хранения данных.

КОНТЕКСТ
Промпт 6 ReportService хранит отчеты локально 24 часа TTL после чего удаляет. Для некоторых сценариев требуется долгосрочное хранение: клиенты запрашивают повторную отправку через неделю, compliance требования хранить записи диагностики 30-90 дней, аналитика трендов по отчетам за месяц. Seafile предоставляет self-hosted облачное хранилище с клиент-серверной синхронизацией, web UI для доступа, версионирование файлов, шифрование опционально. Киоск использует Seafile client для автоматической синхронизации папки reports в центральную библиотеку, после синхронизации локальный файл может быть удален или оставлен как cache. Операторы и клиенты получают доступ к отчетам через Seafile web UI или прямые ссылки. Зависимости: промпт 6 ReportService генерирует отчеты, промпт 9 забирает их для архивации.

ГРАНИЦЫ
Внутри: SeafileClient установка конфигурация синхронизации, расширение ReportService с методом archiveReport, автоматическая синхронизация по расписанию cron, retention policy конфигурация, доступ API для получения archived отчетов. Вне: Seafile сервер deployment database backup web UI hosting, пользовательские аккаунты клиентов для доступа к отчетам, интеграция с billing системами, external storage backends S3 или NAS. Интеграция: промпт 6 ReportService вызывает archiveReport после генерации, промпт 7 monitoring метрики синхронизации, промпт 8 security аудит доступа к архиву.

АРХИТЕКТУРА

МОДУЛЬ SeafileClient
Файл apps/kiosk-agent/src/file-transfer/SeafileClient.ts
Класс SeafileClient методы:

- init serverUrl string username string password string libraryId string returns Promise InitResult
- syncDirectory localPath string remotePath string returns Promise SyncResult
- uploadFile localFilePath string remoteFilePath string returns Promise UploadResult
- downloadFile remoteFilePath string localFilePath string returns Promise DownloadResult
- listFiles remotePath string returns Promise array FileInfo
- deleteFile remoteFilePath string returns Promise DeleteResult
- getShareLink filePath string expirationDays number returns Promise ShareLink

InitResult interface:

- connected boolean
- serverVersion string
- libraryName string
- availableSpace number bytes

SyncResult interface:

- uploaded number count
- downloaded number count
- deleted number count
- errors array string
- duration number ms

UploadResult interface:

- success boolean
- remoteFilePath string
- size number bytes
- uploadedAt string ISO8601

FileInfo interface:

- path string
- name string
- size number bytes
- type file|dir
- modifiedAt string ISO8601

ShareLink interface:

- url string
- token string
- expiresAt string ISO8601

Seafile HTTP API интеграция:

- Аутентификация: POST serverUrl/api2/auth-token с username password получение token
- Upload файла: POST serverUrl/api2/repos/libraryId/upload-link получение upload URL, затем multipart form upload
- List файлов: GET serverUrl/api2/repos/libraryId/dir с path query param
- Download файла: GET serverUrl/api2/repos/libraryId/file с path query param
- Share link: POST serverUrl/api2/repos/libraryId/file/shared-link/ с path и expire_days

Синхронизация директории syncDirectory:

- Сканирует localPath рекурсивно получает список файлов
- Получает список remotePath через listFiles API
- Определяет новые файлы local not in remote для upload
- Определяет устаревшие файлы remote older than local для upload update
- Определяет удаленные файлы remote not in local опционально для delete если настроено
- Выполняет batch upload для новых файлов
- Возвращает SyncResult со статистикой

МОДУЛЬ ArchiveService
Файл apps/kiosk-agent/src/file-transfer/ArchiveService.ts
Класс ArchiveService методы:

- archiveReport reportId string returns Promise ArchiveResult
- getArchivedReport reportId string returns Promise Report or null
- listArchivedReports filter ArchiveFilter returns Promise array ReportMetadata
- deleteArchivedReport reportId string returns Promise DeleteResult
- scheduleSync cronExpression string returns void
- manualSync returns Promise SyncResult

ArchiveResult interface:

- reportId string
- archived boolean
- remotePath string
- shareLink string optional
- archivedAt string ISO8601

ArchiveFilter interface:

- startDate string optional
- endDate string optional
- type THICKNESS|DIAGNOSTICS optional
- sessionId string optional
- limit number default 100
- offset number default 0

ReportMetadata interface:

- reportId string
- type THICKNESS|DIAGNOSTICS
- sessionId string
- generatedAt string ISO8601
- archivedAt string ISO8601
- remotePath string
- size number bytes

Логика archiveReport:

- Получает Report из ReportService.getReport reportId
- Проверяет что pdfPath существует локально
- Генерирует remotePath reports/YYYY/MM/DD/reportId.pdf
- Вызывает SeafileClient.uploadFile pdfPath remotePath
- Опционально генерирует ShareLink с expirationDays настроенным в config
- Сохраняет metadata в локальную базу reports_archive table: reportId remotePath archivedAt shareLink
- Возвращает ArchiveResult

Автоматическая синхронизация scheduleSync:

- Использует node-cron для планирования синхронизации по cronExpression например 0 4 * * * каждый день в 4 AM
- При срабатывании вызывает SeafileClient.syncDirectory localReportsDir remoteReportsDir
- Логирует SyncResult в structured logger и метрики
- При ошибках алертит операторов через Prometheus alert

МОДУЛЬ RetentionPolicy
Файл apps/kiosk-agent/src/file-transfer/RetentionPolicy.ts
Класс RetentionPolicy методы:

- applyPolicy returns Promise RetentionResult
- configurePolicy policy PolicyConfig returns void

PolicyConfig interface:

- localRetentionDays number default 1 после синхронизации удалить локальные файлы старше
- remoteRetentionDays number default 90 удалить удаленные файлы старше
- autoDeleteAfterSync boolean default false если true удалять локальные после успешной синхронизации
- exemptPatterns array string regex patterns для файлов которые не удалять например важные отчеты

RetentionResult interface:

- localDeleted number count
- remoteDeleted number count
- errors array string

Логика applyPolicy:

- Локальная очистка: сканирует reports/ локально, находит файлы старше localRetentionDays и уже синхронизированные в Seafile проверка по reports_archive table, удаляет файлы, логирует
- Удаленная очистка: вызывает SeafileClient.listFiles reports, находит файлы старше remoteRetentionDays, проверяет exemptPatterns regex, вызывает SeafileClient.deleteFile для каждого, логирует
- Возвращает RetentionResult со статистикой

REST API

POST /api/reports/:reportId/archive
Архивировать отчет в Seafile
Запрос: пустой или {shareLink: true}
Ответ: 200 OK application/json

```json
{
  "reportId": "uuid",
  "archived": true,
  "remotePath": "reports/2025/01/15/uuid.pdf",
  "shareLink": "https://seafile.internal/f/abc123/",
  "archivedAt": "2025-01-15T10:30:00Z"
}
```

GET /api/reports/archived
Получить список архивированных отчетов
Query params: startDate endDate type sessionId limit offset
Ответ: 200 OK application/json

```json
{
  "reports": [
    {"reportId": "uuid", "type": "DIAGNOSTICS", "sessionId": "uuid", "generatedAt": "2025-01-15T10:00:00Z", "archivedAt": "2025-01-15T10:30:00Z", "remotePath": "reports/2025/01/15/uuid.pdf", "size": 102400}
  ],
  "total": 250,
  "limit": 100,
  "offset": 0
}
```

GET /api/reports/archived/:reportId
Получить метаданные и ссылку на архивированный отчет
Ответ: 200 OK application/json

```json
{
  "reportId": "uuid",
  "type": "DIAGNOSTICS",
  "remotePath": "reports/2025/01/15/uuid.pdf",
  "shareLink": "https://seafile.internal/f/abc123/",
  "archivedAt": "2025-01-15T10:30:00Z"
}
```

POST /api/reports/sync
Ручная синхронизация с Seafile
Ответ: 202 Accepted application/json

```json
{
  "syncId": "uuid",
  "status": "running"
}
```

GET /api/reports/sync/:syncId
Статус синхронизации
Ответ: 200 OK application/json

```json
{
  "syncId": "uuid",
  "status": "completed",
  "result": {"uploaded": 10, "downloaded": 0, "deleted": 0, "errors": [], "duration": 5000}
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/file-transfer/tests/

- SeafileClient.test.ts: init подключение к mock Seafile API возвращает token, uploadFile POST multipart form upload success, listFiles GET парсит JSON response, syncDirectory определяет новые и устаревшие файлы, deleteFile DELETE возвращает 200
- ArchiveService.test.ts: archiveReport вызывает SeafileClient.uploadFile и сохраняет metadata, getArchivedReport читает из reports_archive table, listArchivedReports фильтрация по дате и типу, scheduleSync регистрирует cron job
- RetentionPolicy.test.ts: applyPolicy удаляет локальные файлы старше threshold, remoteDeleted вызывает SeafileClient.deleteFile для старых файлов, exemptPatterns пропускает файлы matching regex

Интеграционные тесты apps/kiosk-agent/src/file-transfer/tests/integration/

- seafile-integration.test.ts: запуск реального Seafile сервера в Docker, init подключение, uploadFile загрузка тестового PDF, listFiles проверка файл появился, downloadFile скачивание и сравнение содержимого, deleteFile удаление, disconnect
- archive-flow.test.ts: генерация отчета через ReportService, archiveReport загрузка в Seafile, getArchivedReport получение metadata, listArchivedReports проверка в списке, deleteArchivedReport удаление из Seafile и metadata
- sync-scheduling.test.ts: scheduleSync с тестовым cron каждую минуту, ожидание срабатывания, проверка SyncResult метрики обновлены, логи содержат sync completed

E2E тесты apps/kiosk-agent/src/file-transfer/tests/e2e/

- full-archive-lifecycle.test.ts: клиент проходит диагностику OBD, отчет генерируется и доставляется email, оператор архивирует отчет POST /api/reports/:id/archive, проверка Seafile web UI файл доступен, клиент запрашивает повторную отправку через неделю, оператор находит в архиве GET /api/reports/archived?sessionId, отправляет share link клиенту
- retention-policy-test.test.ts: генерация 100 отчетов за 100 дней, синхронизация в Seafile, applyPolicy с localRetentionDays 7 remoteRetentionDays 90, проверка локальные файлы старше 7 дней удалены, удаленные файлы старше 90 дней удалены, файлы между 7-90 дней остались только в Seafile
- sync-error-handling.test.ts: Seafile сервер недоступен, syncDirectory возвращает errors, метрики file_transfer_sync_failed_total инкрементируются, alert срабатывает, восстановление сервера, следующий sync успешен

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/file-transfer/README.md
Секции:

- Обзор: зачем Seafile архивация долгосрочное хранение центральный доступ
- Seafile Setup: установка сервера создание library получение library ID и auth token
- Configuration: ENV переменные SEAFILE_SERVER_URL SEAFILE_USERNAME SEAFILE_PASSWORD SEAFILE_LIBRARY_ID
- Archive Workflow: как работает archiveReport автоматическая синхронизация retention policy
- API Usage: примеры POST archive GET archived list ручная синхронизация
- Retention Policy: настройка localRetentionDays remoteRetentionDays exemptPatterns
- Troubleshooting: Seafile недоступен проверка connectivity, upload fail проверка library ID и permissions, sync медленный оптимизация batch size

ПРИМЕРЫ

Пример архивация отчета

```typescript
// apps/kiosk-agent/src/api/reports/reports-routes.ts
import { ArchiveService } from '../../file-transfer/ArchiveService.js';

const archiveService = new ArchiveService();

app.post('/api/reports/:reportId/archive', async (req, res) => {
  const { reportId } = req.params;
  const { shareLink } = req.body;

  try {
    const result = await archiveService.archiveReport(reportId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Archive failed', message: error.message });
  }
});
```

Пример автоматическая синхронизация

```typescript
// apps/kiosk-agent/src/file-transfer/sync-scheduler.ts
import { ArchiveService } from './ArchiveService.js';
import { StructuredLogger } from '../monitoring/StructuredLogger.js';

const archiveService = new ArchiveService();
const logger = StructuredLogger.getInstance().child('sync-scheduler');

archiveService.scheduleSync('0 4 * * *');

logger.info('Seafile sync scheduled at 4 AM daily');
```

Пример retention policy

```typescript
// apps/kiosk-agent/src/file-transfer/retention-cron.ts
import { RetentionPolicy } from './RetentionPolicy.js';
import cron from 'node-cron';

const retentionPolicy = new RetentionPolicy();

retentionPolicy.configurePolicy({
  localRetentionDays: 7,
  remoteRetentionDays: 90,
  autoDeleteAfterSync: true,
  exemptPatterns: ['/important-.*\\.pdf$/']
});

cron.schedule('0 5 * * *', async () => {
  const result = await retentionPolicy.applyPolicy();
  console.log('Retention policy applied:', result);
});
```

Пример Seafile client init

```typescript
// apps/kiosk-agent/src/file-transfer/seafile-init.ts
import { SeafileClient } from './SeafileClient.js';

const seafileClient = new SeafileClient();

const initResult = await seafileClient.init(
  process.env.SEAFILE_SERVER_URL,
  process.env.SEAFILE_USERNAME,
  process.env.SEAFILE_PASSWORD,
  process.env.SEAFILE_LIBRARY_ID
);

if (initResult.connected) {
  console.log('Seafile connected:', initResult.libraryName);
} else {
  throw new Error('Seafile connection failed');
}
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
SEAFILE_SERVER_URL=https://seafile.internal
SEAFILE_USERNAME=kiosk-agent
SEAFILE_PASSWORD=secure-password
SEAFILE_LIBRARY_ID=library-uuid
SEAFILE_SYNC_CRON=0 4 * * *
SEAFILE_LOCAL_RETENTION_DAYS=7
SEAFILE_REMOTE_RETENTION_DAYS=90
SEAFILE_AUTO_DELETE_AFTER_SYNC=true
```

Seafile library settings:

- Имя: Kiosk Reports Archive
- Тип: encrypted опционально для чувствительных данных
- Permissions: kiosk-agent user read-write, operators group read-only

БЕЗОПАСНОСТЬ

Seafile credentials: SEAFILE_USERNAME и SEAFILE_PASSWORD в ENV переменных, не в git, permissions 600 для .env файла
Encrypted library: опционально включить шифрование библиотеки Seafile с паролем, агент хранит password в ENV SEAFILE_LIBRARY_PASSWORD
Share links expiration: всегда устанавливать expirationDays для share links, default 7 дней, не создавать permanent links
Access control: операторы read-only доступ к архиву через Seafile web UI, только admin может удалять файлы
Audit: все архивации логируются в AuditLogger категория FileChange action file_archived details reportId remotePath size

МЕТРИКИ

file_transfer_archived_reports_total counter labels type string success boolean: количество архивированных отчетов
file_transfer_sync_duration_seconds histogram: длительность синхронизации
file_transfer_sync_uploaded_files_total counter: количество загруженных файлов
file_transfer_sync_failed_total counter labels reason string: неудачные синхронизации
file_transfer_retention_deleted_local_total counter: локальные файлы удалены retention policy
file_transfer_retention_deleted_remote_total counter: удаленные файлы удалены retention policy

РИСКИ

Seafile сервер недоступен: синхронизация fail, отчеты накапливаются локально. Решение: алерт на sync_failed, ручная синхронизация после восстановления, локальные файлы не удаляются до успешной синхронизации
Network bandwidth: upload больших PDF файлов медленный. Решение: синхронизация по расписанию в нерабочее время, batch upload optimization, compression PDF перед upload опционально
Storage capacity: Seafile диск заполнен. Решение: мониторинг Seafile доступного места через API, алерт при <10%, retention policy автоматическая очистка старых файлов
Data loss: случайное удаление файлов из Seafile. Решение: Seafile versioning включен, backup Seafile database регулярно, exemptPatterns для важных файлов

ROADMAP

Фаза 1: Seafile client базовая интеграция 1 неделя
Задачи: SeafileClient init upload download listFiles deleteFile, юнит-тесты, интеграционные тесты с Docker Seafile
Критерии: client подключается к Seafile, upload и download работают, тесты проходят

Фаза 2: ArchiveService и API 1 неделя
Задачи: archiveReport интеграция с ReportService, getArchivedReport listArchivedReports API endpoints, scheduleSync автоматическая синхронизация, метрики и логирование
Критерии: отчеты архивируются автоматически, API возвращает archived отчеты, sync по расписанию работает

Фаза 3: Retention policy и продовая готовность 1 неделя
Задачи: RetentionPolicy applyPolicy локальная и удаленная очистка, конфигурация через ENV, E2E тесты full lifecycle retention policy, документация
Критерии: retention policy удаляет старые файлы, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. SeafileClient подключается к Seafile серверу и выполняет upload download listFiles deleteFile
2. ArchiveService архивирует отчеты в Seafile после генерации
3. Автоматическая синхронизация scheduleSync работает по cron расписанию
4. RetentionPolicy удаляет локальные файлы >7 дней и удаленные файлы >90 дней
5. REST API endpoints archive list archived sync доступны
6. Метрики file_transfer_* экспортируются в Prometheus
7. Юнит-тесты покрытие >80% для file-transfer модулей
8. Интеграционные тесты seafile-integration archive-flow sync-scheduling проходят
9. E2E тесты full-archive-lifecycle retention-policy-test sync-error-handling проходят
10. Документация полная с Seafile setup и troubleshooting

ИТОГ

Промпт 9 расширяет ReportService промпта 6 долгосрочным хранением отчетов через Seafile self-hosted облако. Киоск автоматически синхронизирует отчеты в центральный архив по расписанию, retention policy очищает старые файлы локально и удаленно. Операторы и клиенты получают доступ к архивированным отчетам через Seafile web UI или share links. Интеграция с промптами 6 7 8 обеспечивает seamless workflow генерация архивация мониторинг аудит.
