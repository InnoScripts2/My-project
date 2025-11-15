# Промпт 8 безопасность и удаленный доступ

ЦЕЛЬ
Внедрить полный стек безопасности киоска: hardening операционной системы Windows или Linux с блокировкой UI, автозапуском приложения, Wazuh SIEM агент для мониторинга безопасности File Integrity Monitoring rootkit detection vulnerability scanning, Firezone ZTNA Zero Trust Network Access для безопасного удаленного доступа операторов с MFA, Guacamole и MeshCentral для web-based и agent-based удаленного управления, аудит журналирование всех подключений и действий append-only логи 90 дней, автоматические обновления агента с rollback механизмом. Цель: защита от несанкционированного доступа, минимизация поверхности атаки, безопасный оперативный доступ, автоматическое обнаружение инцидентов.

КОНТЕКСТ
Киоск работает в публичном месте автономно, уязвим к физическому и сетевому доступу. Требуется: блокировка системного UI чтобы клиент не мог выйти из киоска в ОС, автозапуск приложения при старте системы, минимальные права пользователя киоска, сетевые правила firewall разрешающие только необходимые подключения HTTP агента PSP endpoints GitHub Pages email SMS, Wazuh агент устанавливается для continuous security monitoring файлов rootkit сканирования vulnerability assessments логирование на центральный Wazuh сервер. Удаленный доступ операторов только через Firezone ZTNA туннель с MFA, после аутентификации операторы получают доступ к Guacamole browser RDP/SSH gateway или MeshCentral agent management. Все действия логируются append-only журнал 90 дней ретенция. Обновления агента через GitHub Releases с подписью verification rollback при failure. Зависимости: промпты 1-7 защищаются данным промптом, endpoints API закрываются, логи secure, metrics endpoint опционально auth.

ГРАНИЦЫ
Внутри: hardening checklist Windows Kiosk Mode или Linux kiosk setup, Wazuh agent installation configuration policies, Firezone client setup ресурс регистрация access policies, Guacamole RDP/SSH прокси setup, MeshCentral agent deployment, audit logging append-only файлы, update automation скрипты. Вне: центральный Wazuh сервер deployment управление, Firezone сервер инфраструктура, Guacamole MeshCentral сервер hosting, CA certificates выпуск, PKI infrastructure, network perimeter firewall. Интеграция: промпт 7 monitoring интегрируется с security events алерты на unauthorized access attempts, промпт 9 файловые операции проверяются Wazuh FIM.

АРХИТЕКТУРА

МОДУЛЬ HardeningChecklist
Файл apps/kiosk-agent/src/security/HardeningChecklist.ts
Класс HardeningChecklist методы:

- runChecks → Promise<HardeningReport>
- getCheckStatus checkId string → CheckStatus
- exportReport format json|html → string

HardeningReport interface:

- timestamp string ISO8601
- platform Windows|Linux
- checks array CheckResult
- overallStatus passed|failed|warning
- recommendations array string

CheckResult interface:

- id string
- category OS|Network|User|Services
- description string
- status passed|failed|warning
- details string
- remediation string

Проверки:

**OS категория:**

- kiosk_mode_enabled: Windows Kiosk Mode активирован или Linux display manager lock, ожидание true
- auto_login_configured: автологин в киоск аккаунт настроен без пароля prompt
- system_shortcuts_blocked: Alt+Tab Win Ctrl+Alt+Del Task Manager заблокированы через Group Policy или compositor rules
- updates_scheduled: автоматические обновления настроены в нерабочее время 2-5 AM

**Network категория:**

- firewall_rules_configured: разрешены только порты 80 443 для агента outbound, SSH 22 только localhost или Firezone
- vpn_required: доступ без VPN заблокирован кроме локальных сервисов
- dns_hardened: DNS настроен на trusted resolvers 1.1.1.1 или корпоративный

**User категория:**

- unprivileged_user: киоск процесс запущен под непривилегированным пользователем без sudo/admin
- home_directory_restricted: home directory permissions 700, нет доступа других users
- sudo_disabled: sudo access отключен для kiosk user

**Services категория:**

- unnecessary_services_disabled: telnet FTP SMB print spooler disabled если не требуются
- agent_auto_start: kiosk-agent systemd service или Windows Service автозапуск enabled
- frontend_auto_start: kiosk-frontend автозапуск browser в kiosk mode или Electron

Формат отчета JSON для автоматической проверки CI:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "platform": "Windows",
  "checks": [
    {"id": "kiosk_mode_enabled", "category": "OS", "description": "Kiosk mode active", "status": "passed", "details": "AssignedAccess configured", "remediation": null},
    {"id": "firewall_rules_configured", "category": "Network", "description": "Firewall rules", "status": "warning", "details": "SSH port 22 open globally", "remediation": "Restrict SSH to localhost only"}
  ],
  "overallStatus": "warning",
  "recommendations": ["Close SSH port 22 globally", "Enable MFA for VPN access"]
}
```

МОДУЛЬ WazuhAgent
Файл apps/kiosk-agent/src/security/WazuhAgent.ts
Класс WazuhAgent методы:

- installAgent → Promise<InstallResult>
- configureAgent config WazuhConfig → Promise<void>
- startAgent → Promise<void>
- stopAgent → Promise<void>
- getStatus → Promise<AgentStatus>

WazuhConfig interface:

- serverAddress string IP или hostname
- authKey string agent registration key
- groups array string например kiosks prod
- policies array PolicyConfig

PolicyConfig interface:

- name string FIM|RootkitDetection|VulnerabilityScanning
- enabled boolean
- settings object

FIM File Integrity Monitoring настройки:

- Директории для мониторинга: apps/kiosk-agent/src, apps/kiosk-frontend, config/, logs/ только append changes
- Исключения: node_modules, logs/app-YYYY-MM-DD.log ротируемые файлы
- Алерты: любое изменение в src директориях кроме expected updates через deployment
- Real-time мониторинг enabled

Rootkit Detection настройки:

- Системные бинарники: /bin, /usr/bin, C:\Windows\System32
- Скрытые процессы проверка
- Скрытые порты проверка
- Периодичность: каждые 6 часов

Vulnerability Scanning настройки:

- Package managers: npm для Node.js, apt/yum для Linux, Windows Update для Windows
- CVE базы: автоматическое обновление daily
- Scan периодичность: daily в 3 AM
- Severity threshold: Critical и High алертить немедленно

Wazuh агент отправляет логи на центральный Wazuh сервер через TLS 1514 порт. Алерты настраиваются в Wazuh Manager UI.

МОДУЛЬ FirezoneClient
Файл apps/kiosk-agent/src/security/FirezoneClient.ts
Класс FirezoneClient методы:

- registerResource resourceId string name string tags array string → Promise<RegistrationResult>
- updateAccessPolicy resourceId string policy AccessPolicy → Promise<void>
- getConnectionStatus → Promise<ConnectionStatus>
- rotateKeys → Promise<void>

AccessPolicy interface:

- allowedRoles array string например operator admin
- mfaRequired boolean
- sessionTimeout number minutes по умолчанию 60
- ipWhitelist array string optional
- timeRestrictions object optional {allowedDays: array number, allowedHours: {start: number, end: number}}

RegistrationResult interface:

- resourceId string UUID
- deviceToken string для туннелирования
- gatewayAddress string Firezone gateway IP или hostname

Настройка Firezone:

- Киоск регистрируется как ресурс с тегами kiosk prod location-X
- Access Policy: operators роль read-only для логов, admin роль write для конфигурации и обновлений
- MFA обязателен для всех подключений через Duo или Authy TOTP
- Session timeout 60 минут, переподключение требует re-auth
- Туннель устанавливается через WireGuard протокол, трафик шифруется end-to-end

Операторские рабочие станции устанавливают Firezone client, после авторизации получают список доступных киосков, выбирают нужный, туннель устанавливается, далее подключение к Guacamole или MeshCentral через туннель.

МОДУЛЬ GuacamoleProxy
Файл apps/kiosk-agent/src/security/GuacamoleProxy.ts
Класс GuacamoleProxy методы:

- createConnection protocol RDP|SSH host string port number credentials Credentials → Promise<Connection>
- listConnections → Promise<array Connection>
- terminateConnection connectionId string → Promise<void>
- getSessionLogs connectionId string → Promise<array LogEntry>

Credentials interface:

- username string
- password string optional если SSH key auth
- privateKey string optional для SSH
- domain string optional для RDP

Connection interface:

- connectionId string UUID
- protocol RDP|SSH
- host string
- createdAt string ISO8601
- userId string оператор
- status active|terminated

Guacamole deployment:

- Отдельный сервер не на киоске в защищенном сегменте
- Доступ через Firezone туннель https://guacamole.internal:8443
- RDP к киоску Windows: protocol RDP, host kiosk-agent-ip, port 3389, credentials kiosk user read-only или admin
- SSH к киоску Linux: protocol SSH, host kiosk-agent-ip, port 22, credentials kiosk user или admin
- Логирование всех сессий: keystroke recording, screen recording optional для audit

МОДУЛЬ MeshCentralAgent
Файл apps/kiosk-agent/src/security/MeshCentralAgent.ts
Класс MeshCentralAgent методы:

- installAgent serverUrl string meshId string → Promise<InstallResult>
- getAgentStatus → Promise<AgentStatus>
- executeCommand command string args array string → Promise<CommandResult>
- uploadFile localPath string remotePath string → Promise<UploadResult>
- downloadFile remotePath string localPath string → Promise<DownloadResult>

AgentStatus interface:

- installed boolean
- version string
- connected boolean
- lastSeen string ISO8601
- meshId string

MeshCentral deployment:

- Отдельный сервер MeshCentral в защищенном сегменте
- Доступ через Firezone туннель https://meshcentral.internal
- Киоск устанавливает MeshCentral агент, регистрируется в mesh group kiosks
- Операторы подключаются через web UI, выбирают киоск, получают remote desktop file manager terminal
- Роли: operator read-only просмотр логов и метрик, admin полный доступ файлы команды restart
- Агент работает как Windows Service или systemd service, автоматически переподключается при потере связи

МОДУЛЬ AuditLogger
Файл apps/kiosk-agent/src/security/AuditLogger.ts
Класс AuditLogger методы:

- logEvent category string action string userId string details object → Promise<void>
- queryLogs filter AuditFilter → Promise<array AuditLogEntry>
- exportLogs startDate string endDate string format json|csv → Promise<string>
- cleanupOldLogs retentionDays number → Promise<number>

AuditLogEntry interface:

- eventId string UUID
- timestamp string ISO8601
- category RemoteAccess|FileChange|ConfigChange|SystemEvent
- action string например ssh_login, rdp_session, file_modified, config_updated, agent_restart
- userId string оператор или system
- details object зависит от category
- sourceIp string optional
- result success|failure
- errorMessage string optional

Категории событий:

**RemoteAccess:**

- ssh_login, rdp_session, guacamole_connection, meshcentral_connection
- Детали: protocol, sourceIp, duration seconds, commands executed optional

**FileChange:**

- file_created, file_modified, file_deleted
- Детали: filePath, oldHash optional, newHash, size bytes, triggeredBy wazuh|operator|system

**ConfigChange:**

- config_updated, env_variable_changed, service_restarted
- Детали: configKey, oldValue masked, newValue masked, changedBy

**SystemEvent:**

- agent_started, agent_stopped, agent_updated, hardening_check_failed
- Детали: version, exitCode, checkId optional

Хранилище логов:

- Файл logs/audit-YYYY-MM.log append-only
- Permissions 400 read-only для kiosk user, root owner
- Формат: JSONL каждая строка JSON AuditLogEntry
- Ротация ежемесячно
- Ретенция 90 дней, старые файлы архивируются в logs/archive/ с gzip
- Автоматическая очистка cron job ежедневно

МОДУЛЬ UpdateManager
Файл apps/kiosk-agent/src/security/UpdateManager.ts
Класс UpdateManager методы:

- checkForUpdates → Promise<UpdateInfo>
- downloadUpdate version string → Promise<DownloadResult>
- verifySignature artifactPath string signaturePath string publicKey string → Promise<boolean>
- applyUpdate artifactPath string → Promise<ApplyResult>
- rollback → Promise<RollbackResult>
- scheduleUpdate version string scheduledTime string → Promise<void>

UpdateInfo interface:

- currentVersion string
- latestVersion string
- updateAvailable boolean
- releaseNotes string
- downloadUrl string
- signatureUrl string
- publishedAt string ISO8601

ApplyResult interface:

- success boolean
- newVersion string
- oldVersion string
- restartRequired boolean
- errorMessage string optional

Процесс обновления:

1. Проверка GitHub Releases API GET repos/owner/repo/releases/latest
2. Сравнение currentVersion с latestVersion semver
3. Загрузка артефакта kiosk-agent-vX.Y.Z.tar.gz и signature файла kiosk-agent-vX.Y.Z.tar.gz.sig
4. Верификация подписи через GPG public key из config publicKey.pem
5. Резервное копирование текущей версии в backups/kiosk-agent-vOLD.tar.gz
6. Распаковка нового артефакта в temp директорию
7. Остановка агента systemctl stop kiosk-agent или Stop-Service
8. Замена файлов в apps/kiosk-agent
9. Запуск агента systemctl start kiosk-agent или Start-Service
10. Проверка health endpoint GET /api/health через 30 секунд
11. Если health check fail: rollback к backup версии, алерт операторам

Rollback механизм:

- При failure apply или health check: автоматический откат
- Восстановление файлов из backups/kiosk-agent-vOLD.tar.gz
- Перезапуск агента
- Логирование rollback события в audit log
- Уведомление операторам через Prometheus alert или email

Scheduling:

- Обновления планируются на нерабочее время 2-5 AM
- Оператор может форсировать немедленное обновление через admin API POST /api/admin/update/apply

REST API

GET /api/security/hardening
Запуск hardening checks и возврат отчета
Ответ: 200 OK application/json

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "platform": "Windows",
  "checks": [...],
  "overallStatus": "passed",
  "recommendations": []
}
```

GET /api/security/wazuh/status
Статус Wazuh агента
Ответ: 200 OK application/json

```json
{
  "installed": true,
  "version": "4.5.0",
  "connected": true,
  "lastSeen": "2025-01-15T10:29:45Z",
  "policies": ["FIM", "RootkitDetection", "VulnerabilityScanning"]
}
```

GET /api/security/firezone/status
Статус Firezone подключения
Ответ: 200 OK application/json

```json
{
  "resourceId": "uuid",
  "connected": true,
  "gatewayAddress": "firezone.internal",
  "activeConnections": 2
}
```

GET /api/security/audit
Получение audit логов с фильтрацией
Query params: startDate string, endDate string, category string optional, userId string optional
Ответ: 200 OK application/json

```json
{
  "logs": [
    {"eventId": "uuid", "timestamp": "2025-01-15T10:00:00Z", "category": "RemoteAccess", "action": "ssh_login", "userId": "operator1", "details": {"sourceIp": "10.0.0.5", "duration": 1200}, "result": "success"}
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
}
```

POST /api/admin/update/check
Проверка наличия обновлений требует admin auth
Ответ: 200 OK application/json

```json
{
  "currentVersion": "1.2.0",
  "latestVersion": "1.3.0",
  "updateAvailable": true,
  "releaseNotes": "Bug fixes and security patches",
  "downloadUrl": "https://github.com/owner/repo/releases/download/v1.3.0/kiosk-agent-v1.3.0.tar.gz",
  "signatureUrl": "https://github.com/owner/repo/releases/download/v1.3.0/kiosk-agent-v1.3.0.tar.gz.sig"
}
```

POST /api/admin/update/apply
Применить обновление немедленно или по расписанию
Запрос: application/json

```json
{
  "version": "1.3.0",
  "scheduledTime": "2025-01-16T03:00:00Z"
}
```

Ответ: 202 Accepted application/json

```json
{
  "updateId": "uuid",
  "status": "scheduled",
  "scheduledTime": "2025-01-16T03:00:00Z"
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/security/tests/

- HardeningChecklist.test.ts: runChecks возвращает отчет, все checks passed mock system state, один check failed status warning или failed, exportReport JSON и HTML форматы валидны
- WazuhAgent.test.ts: configureAgent записывает конфиг, startAgent вызывает system command wazuh-control start mock exec, getStatus парсит wazuh-control status output
- FirezoneClient.test.ts: registerResource возвращает resourceId deviceToken, updateAccessPolicy сохраняет policy, getConnectionStatus проверяет WireGuard tunnel status
- AuditLogger.test.ts: logEvent добавляет entry в файл append, queryLogs фильтрует по category и userId, cleanupOldLogs удаляет файлы старше retentionDays
- UpdateManager.test.ts: checkForUpdates парсит GitHub API response, verifySignature true для valid signature false для invalid, applyUpdate backup restore на failure

Интеграционные тесты apps/kiosk-agent/src/security/tests/integration/

- hardening-checks.test.ts: запуск реального hardening check на тестовой VM, проверка kiosk_mode_enabled firewall_rules_configured statuses, генерация HTML отчета открывается в браузере
- wazuh-integration.test.ts: установка Wazuh агент на тестовой системе, конфигурация FIM для test directory, создание файла в monitored dir, проверка Wazuh alert появился в Wazuh Manager API
- firezone-connection.test.ts: регистрация test ресурса в Firezone staging server, установка туннеля, проверка connectivity через туннель curl test endpoint, разрыв туннеля getConnectionStatus connected false
- audit-logging.test.ts: logEvent записывает в файл, проверка permissions 400, queryLogs читает файлы, exportLogs генерирует CSV, cleanupOldLogs удаляет старые файлы проверка retention

E2E тесты apps/kiosk-agent/src/security/tests/e2e/

- full-remote-access-flow.test.ts: оператор подключается через Firezone VPN mock, открывает Guacamole web UI, создает RDP session к киоску, выполняет команды в киоске, сессия логируется в audit log, оператор отключается, audit log содержит ssh_login и commands executed
- update-flow.test.ts: checkForUpdates возвращает new version, downloadUpdate скачивает artifact, verifySignature success, applyUpdate устанавливает, health check success, currentVersion обновлена, rollback если health check fail восстановление старой версии
- security-incident-simulation.test.ts: симуляция unauthorized file modification в src/, Wazuh FIM детектирует change, alert отправлен в Wazuh Manager, audit log содержит file_modified event, оператор получает notification

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/security/README.md
Секции:

- Обзор: безопасность hardening удаленный доступ аудит обновления
- Hardening: чек-лист Windows Kiosk Mode Linux setup блокировка shortcuts автозапуск firewall rules
- Wazuh: установка агента конфигурация FIM Rootkit Vulnerability policies алерты
- Firezone: регистрация ресурса access policies MFA session timeout туннелирование WireGuard
- Guacamole: RDP SSH proxy deployment логирование сессий
- MeshCentral: agent installation роли операторов remote desktop file manager
- Audit Logging: категории событий JSONL формат ретенция 90 дней query и export
- Updates: GitHub Releases GPG signature verification rollback scheduling
- Troubleshooting: Wazuh агент не подключается проверка сети и auth key, Firezone туннель не работает проверка gateway address и device token, update fail проверка signature и rollback

ПРИМЕРЫ

Пример hardening check usage

```typescript
// apps/kiosk-agent/src/index.ts
import { HardeningChecklist } from './security/HardeningChecklist.js';

const checklist = new HardeningChecklist();
const report = await checklist.runChecks();

if (report.overallStatus === 'failed') {
  console.error('Hardening checks failed:', report.recommendations);
  process.exit(1);
}

console.log('Hardening checks passed');
```

Пример Wazuh agent configuration

```typescript
// apps/kiosk-agent/src/security/wazuh-init.ts
import { WazuhAgent } from './WazuhAgent.js';

const wazuh = new WazuhAgent();
await wazuh.configureAgent({
  serverAddress: process.env.WAZUH_SERVER,
  authKey: process.env.WAZUH_AUTH_KEY,
  groups: ['kiosks', 'prod'],
  policies: [
    {
      name: 'FIM',
      enabled: true,
      settings: {
        directories: ['apps/kiosk-agent/src', 'apps/kiosk-frontend'],
        realTime: true
      }
    },
    {
      name: 'RootkitDetection',
      enabled: true,
      settings: { interval: 21600 }
    },
    {
      name: 'VulnerabilityScanning',
      enabled: true,
      settings: { scanTime: '03:00', severity: ['Critical', 'High'] }
    }
  ]
});

await wazuh.startAgent();
console.log('Wazuh agent started');
```

Пример Firezone resource registration

```typescript
// apps/kiosk-agent/src/security/firezone-init.ts
import { FirezoneClient } from './FirezoneClient.js';

const firezone = new FirezoneClient();
const result = await firezone.registerResource(
  process.env.KIOSK_ID,
  `Kiosk-${process.env.LOCATION}`,
  ['kiosk', 'prod', process.env.LOCATION]
);

await firezone.updateAccessPolicy(result.resourceId, {
  allowedRoles: ['operator', 'admin'],
  mfaRequired: true,
  sessionTimeout: 60,
  timeRestrictions: {
    allowedDays: [1, 2, 3, 4, 5],
    allowedHours: { start: 8, end: 20 }
  }
});

console.log('Firezone resource registered:', result.resourceId);
```

Пример audit logging

```typescript
// apps/kiosk-agent/src/api/admin/admin-routes.ts
import { AuditLogger } from '../../security/AuditLogger.js';

const auditLogger = new AuditLogger();

app.post('/api/admin/config', async (req, res) => {
  const { configKey, newValue } = req.body;

  await auditLogger.logEvent('ConfigChange', 'config_updated', req.user.id, {
    configKey,
    oldValue: '***masked***',
    newValue: '***masked***',
    changedBy: req.user.id
  });

  res.json({ success: true });
});
```

Пример update check

```typescript
// apps/kiosk-agent/src/security/update-scheduler.ts
import { UpdateManager } from './UpdateManager.js';

const updateManager = new UpdateManager();

setInterval(async () => {
  const updateInfo = await updateManager.checkForUpdates();

  if (updateInfo.updateAvailable) {
    console.log(`Update available: ${updateInfo.latestVersion}`);

    await updateManager.scheduleUpdate(
      updateInfo.latestVersion,
      new Date().setHours(3, 0, 0, 0).toISOString()
    );
  }
}, 86400000);
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
WAZUH_SERVER=wazuh.internal:1514
WAZUH_AUTH_KEY=agent-registration-key
FIREZONE_SERVER=firezone.internal
FIREZONE_DEVICE_TOKEN=device-token-uuid
GUACAMOLE_URL=https://guacamole.internal:8443
MESHCENTRAL_URL=https://meshcentral.internal
MESHCENTRAL_MESH_ID=mesh-id-uuid
GPG_PUBLIC_KEY_PATH=/etc/kiosk/publicKey.pem
UPDATE_CHECK_INTERVAL=86400000
AUDIT_LOG_RETENTION_DAYS=90
```

Wazuh agent конфигурация /var/ossec/etc/ossec.conf

```xml
<ossec_config>
  <client>
    <server>
      <address>wazuh.internal</address>
      <port>1514</port>
      <protocol>tcp</protocol>
    </server>
  </client>

  <syscheck>
    <directories realtime="yes">/opt/kiosk/apps/kiosk-agent/src</directories>
    <directories realtime="yes">/opt/kiosk/apps/kiosk-frontend</directories>
    <ignore>/opt/kiosk/node_modules</ignore>
  </syscheck>

  <rootcheck>
    <frequency>21600</frequency>
  </rootcheck>

  <vulnerability-detector>
    <enabled>yes</enabled>
    <interval>1d</interval>
    <run_on_start>yes</run_on_start>
  </vulnerability-detector>
</ossec_config>
```

Firezone access policy config/firezone-policy.json

```json
{
  "resourceId": "kiosk-uuid",
  "allowedRoles": ["operator", "admin"],
  "mfaRequired": true,
  "sessionTimeout": 60,
  "ipWhitelist": null,
  "timeRestrictions": {
    "allowedDays": [1, 2, 3, 4, 5],
    "allowedHours": {"start": 8, "end": 20}
  }
}
```

БЕЗОПАСНОСТЬ

Secrets хранение: все sensitive данные WAZUH_AUTH_KEY FIREZONE_DEVICE_TOKEN GPG_PRIVATE_KEY в ENV переменных, не в git, файлы permissions 600 read-only для kiosk user
Audit log immutability: файлы append-only через chattr +a на Linux или NTFS ACL deny delete modify на Windows, только root может удалить
Remote access authentication: обязательный MFA для всех Firezone подключений, Guacamole session timeout 60 минут, MeshCentral two-factor auth
Update signature: GPG signature verification обязательна перед apply, public key хранится в secure location, private key только у release maintainers
Wazuh alerts: critical alerts File Integrity violation, rootkit detected, high severity CVE отправляются в Prometheus Alertmanager и email операторам
Network isolation: киоск firewall блокирует все inbound кроме Firezone туннеля, outbound разрешен только к trusted endpoints GitHub PSP email SMS Wazuh Firezone

МЕТРИКИ

security_hardening_checks_total counter labels status passed|failed|warning: количество hardening checks
security_hardening_check_status gauge labels checkId string: статус каждого check 1 passed 0 failed
security_wazuh_agent_connected gauge: Wazuh агент подключен 1 да 0 нет
security_wazuh_alerts_total counter labels severity string: количество Wazuh алертов
security_firezone_connected gauge: Firezone туннель активен 1 да 0 нет
security_remote_sessions_active gauge labels protocol RDP|SSH: активные удаленные сессии
security_audit_events_total counter labels category string: количество audit событий
security_updates_applied_total counter labels success boolean: количество applied updates
security_rollbacks_total counter: количество rollback операций

РИСКИ

Расширение поверхности атаки: удаленный доступ потенциально уязвим. Решение: обязательный MFA session timeout IP whitelist optional time restrictions
Wazuh агент overhead: CPU и network нагрузка. Решение: оптимизация FIM директорий, исключение node_modules и ротируемых логов, rootkit scan раз в 6 часов не чаще
Secrets утечка: ENV переменные могут быть прочитаны. Решение: файлы .env permissions 600, process env не логируется, audit log маскирует secrets
Update failure: новая версия ломает агента. Решение: rollback механизм, health check после update, staging тестирование перед prod
Audit log tampering: операторы могут попытаться удалить следы. Решение: append-only файлы, centralized logging на удаленный syslog или S3, алерты на попытки изменения

ROADMAP

Фаза 1: hardening и Wazuh 1 неделя
Задачи: HardeningChecklist реализация всех checks, WazuhAgent установка конфигурация FIM Rootkit Vulnerability, скрипты установки для Windows и Linux, юнит-тесты
Критерии: hardening checks проходят, Wazuh агент подключен и отправляет алерты, интеграционные тесты на тестовой VM проходят

Фаза 2: Firezone и удаленный доступ 1 неделя
Задачи: FirezoneClient регистрация ресурса access policy, GuacamoleProxy RDP SSH proxy setup, MeshCentralAgent установка agent deployment, документация операторов как подключаться, интеграционные тесты
Критерии: Firezone туннель работает, операторы могут подключиться через Guacamole или MeshCentral, сессии логируются

Фаза 3: audit logging и мониторинг 1 неделя
Задачи: AuditLogger запись всех категорий событий, query и export APIs, retention cleanup, интеграция с промптом 7 метрики security_* в Prometheus, алерты на unauthorized access, E2E тесты
Критерии: все события логируются, audit log immutable, query работает, метрики экспортируются, алерты срабатывают

Фаза 4: обновления и продовая готовность 1 неделя
Задачи: UpdateManager GitHub Releases integration, GPG signature verification, rollback механизм, scheduling, тестирование update flow на staging, документация deployment procedures
Критерии: update проходит успешно, rollback работает, scheduling соблюдается, документация полная

КРИТЕРИИ ACCEPTANCE

1. HardeningChecklist проверяет 12+ checks и возвращает отчет с remediation
2. WazuhAgent настроен с FIM Rootkit Vulnerability policies и отправляет алерты
3. FirezoneClient регистрирует ресурс и поддерживает туннель с MFA
4. GuacamoleProxy и MeshCentralAgent позволяют удаленное управление через туннель
5. AuditLogger записывает все события в append-only файлы с retention 90 дней
6. UpdateManager проверяет обновления верифицирует signature применяет с rollback
7. Юнит-тесты покрытие >80% для security модулей
8. Интеграционные тесты wazuh-integration firezone-connection audit-logging проходят
9. E2E тесты full-remote-access-flow update-flow security-incident-simulation проходят
10. Документация полная с troubleshooting и deployment procedures

ИТОГ

Промпт 8 обеспечивает полную защиту киоска через hardening checklist блокировка UI автозапуск firewall, Wazuh SIEM мониторинг FIM rootkit CVE scanning, Firezone ZTNA безопасный удаленный доступ с MFA, Guacamole MeshCentral удаленное управление RDP SSH web UI, audit logging append-only 90 дней всех событий, автоматические обновления с GPG signature verification rollback. Операторы получают защищенный доступ к киоску для мониторинга обслуживания обновлений. Инциденты детектируются автоматически через Wazuh алерты и audit log. Интеграция с промптом 7 обеспечивает метрики безопасности в Prometheus.
