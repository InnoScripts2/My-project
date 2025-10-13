# Security Module

Полный стек безопасности киоска: hardening, SIEM мониторинг, удаленный доступ, аудит, обновления.

## Модули

### HardeningChecklist
Проверка конфигурации безопасности системы

Категории проверок:
- OS: kiosk mode, auto-login, system shortcuts, updates scheduling
- Network: firewall rules, VPN, DNS hardening
- User: unprivileged user, home directory permissions, sudo disabled
- Services: unnecessary services disabled, agent/frontend auto-start

Использование:
```typescript
import { HardeningChecklist } from './security';

const checklist = new HardeningChecklist();
const report = await checklist.runChecks();

console.log(report.overallStatus);
console.log(report.recommendations);

const htmlReport = checklist.exportReport(report, 'html');
```

### WazuhAgent
Интеграция с Wazuh SIEM для мониторинга безопасности

Функции:
- File Integrity Monitoring (FIM)
- Rootkit Detection
- Vulnerability Scanning

Использование:
```typescript
import { WazuhAgent } from './security';

const wazuh = new WazuhAgent();
await wazuh.configureAgent({
  serverAddress: 'wazuh.internal:1514',
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
    }
  ]
});

await wazuh.startAgent();
const status = await wazuh.getStatus();
```

### FirezoneClient
Управление ZTNA туннелем для удаленного доступа

Функции:
- Регистрация ресурса
- Access policy с MFA
- WireGuard tunnel status

Использование:
```typescript
import { FirezoneClient } from './security';

const firezone = new FirezoneClient();
const result = await firezone.registerResource(
  'kiosk-uuid',
  'Kiosk-Location-1',
  ['kiosk', 'prod', 'location-1']
);

await firezone.updateAccessPolicy(result.resourceId, {
  allowedRoles: ['operator', 'admin'],
  mfaRequired: true,
  sessionTimeout: 60
});

const status = await firezone.getConnectionStatus();
```

### GuacamoleProxy
Управление RDP/SSH подключениями через Guacamole

Функции:
- Создание RDP/SSH сессий
- Управление подключениями
- Логирование сессий

Использование:
```typescript
import { GuacamoleProxy } from './security';

const guacamole = new GuacamoleProxy();
const connection = await guacamole.createConnection(
  'RDP',
  'localhost',
  3389,
  { username: 'admin', password: 'secret' }
);

const logs = await guacamole.getSessionLogs(connection.connectionId);
await guacamole.terminateConnection(connection.connectionId);
```

### MeshCentralAgent
Управление MeshCentral агентом для удаленного управления

Функции:
- Статус агента
- Выполнение команд
- Загрузка/скачивание файлов

Использование:
```typescript
import { MeshCentralAgent } from './security';

const mesh = new MeshCentralAgent();
const status = await mesh.getAgentStatus();

const result = await mesh.executeCommand('ls', ['-la', '/var/log']);
console.log(result.stdout);

await mesh.uploadFile('/local/file.txt', '/remote/file.txt');
```

### AuditLogger
Append-only аудит логирование

Категории событий:
- RemoteAccess: ssh_login, rdp_session, guacamole_connection
- FileChange: file_created, file_modified, file_deleted
- ConfigChange: config_updated, env_variable_changed
- SystemEvent: agent_started, agent_stopped, agent_updated

Использование:
```typescript
import { AuditLogger } from './security';

const auditLogger = new AuditLogger();

await auditLogger.logEvent(
  'RemoteAccess',
  'ssh_login',
  'operator1',
  { protocol: 'ssh', sourceIp: '10.0.0.5' },
  '10.0.0.5',
  'success'
);

const logs = await auditLogger.queryLogs({
  startDate: '2025-01-01T00:00:00Z',
  category: 'RemoteAccess'
});

const csv = await auditLogger.exportLogs(
  '2025-01-01T00:00:00Z',
  '2025-01-31T23:59:59Z',
  'csv'
);

await auditLogger.cleanupOldLogs(90);
```

### UpdateManager
Автоматические обновления с GPG signature verification

Функции:
- GitHub Releases integration
- GPG signature verification
- Atomic apply с rollback
- Update scheduling

Использование:
```typescript
import { UpdateManager } from './security';

const updateManager = new UpdateManager();

const updateInfo = await updateManager.checkForUpdates();
if (updateInfo.updateAvailable) {
  const download = await updateManager.downloadUpdate(updateInfo.latestVersion);
  
  if (download.success && download.signaturePath) {
    const verified = await updateManager.verifySignature(
      download.artifactPath,
      download.signaturePath,
      publicKey
    );
    
    if (verified) {
      const result = await updateManager.applyUpdate(download.artifactPath);
      console.log(result.newVersion);
    }
  }
}

await updateManager.scheduleUpdate('1.3.0', '2025-01-16T03:00:00Z');
```

## REST API

### GET /api/security/hardening
Запуск hardening checks

Response:
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "platform": "Windows",
  "checks": [...],
  "overallStatus": "passed",
  "recommendations": []
}
```

### GET /api/security/wazuh/status
Статус Wazuh агента

Response:
```json
{
  "installed": true,
  "version": "4.5.0",
  "connected": true,
  "lastSeen": "2025-01-15T10:29:45Z",
  "policies": ["FIM", "RootkitDetection", "VulnerabilityScanning"]
}
```

### GET /api/security/firezone/status
Статус Firezone подключения

Response:
```json
{
  "resourceId": "uuid",
  "connected": true,
  "gatewayAddress": "firezone.internal",
  "activeConnections": 2
}
```

### GET /api/security/audit
Получение audit логов

Query params: startDate, endDate, category, userId, page, pageSize

Response:
```json
{
  "logs": [...],
  "total": 150,
  "page": 1,
  "pageSize": 50
}
```

### POST /api/admin/update/check
Проверка наличия обновлений

Response:
```json
{
  "currentVersion": "1.2.0",
  "latestVersion": "1.3.0",
  "updateAvailable": true,
  "releaseNotes": "Bug fixes",
  "downloadUrl": "https://...",
  "signatureUrl": "https://..."
}
```

### POST /api/admin/update/apply
Применить обновление

Request:
```json
{
  "version": "1.3.0",
  "scheduledTime": "2025-01-16T03:00:00Z"
}
```

Response (scheduled):
```json
{
  "updateId": "uuid",
  "status": "scheduled",
  "scheduledTime": "2025-01-16T03:00:00Z"
}
```

Response (immediate):
```json
{
  "success": true,
  "newVersion": "1.3.0",
  "oldVersion": "1.2.0"
}
```

## Prometheus Metrics

- `security_hardening_checks_total{status}` - количество hardening checks
- `security_hardening_check_status{checkId}` - статус каждого check
- `security_wazuh_agent_connected` - Wazuh агент подключен
- `security_wazuh_alerts_total{severity}` - количество Wazuh алертов
- `security_firezone_connected` - Firezone туннель активен
- `security_remote_sessions_active{protocol}` - активные удаленные сессии
- `security_audit_events_total{category}` - количество audit событий
- `security_updates_applied_total{success}` - количество applied updates
- `security_rollbacks_total` - количество rollback операций

## ENV Configuration

```env
WAZUH_SERVER=wazuh.internal:1514
WAZUH_AUTH_KEY=agent-registration-key
FIREZONE_SERVER=firezone.internal
FIREZONE_DEVICE_TOKEN=device-token-uuid
GUACAMOLE_URL=https://guacamole.internal:8443
GUACAMOLE_USERNAME=admin
GUACAMOLE_PASSWORD=secret
MESHCENTRAL_URL=https://meshcentral.internal
MESHCENTRAL_MESH_ID=mesh-id-uuid
GPG_PUBLIC_KEY_PATH=/etc/kiosk/publicKey.pem
AUDIT_LOG_DIR=/var/log/kiosk/audit
AUDIT_LOG_RETENTION_DAYS=90
GITHUB_REPO=InnoScripts2/my-own-service
BACKUP_DIR=/var/backups/kiosk-agent
INSTALL_DIR=/opt/kiosk/apps/kiosk-agent
```

## Security

Secrets хранение: все sensitive данные в ENV переменных, не в git, файлы permissions 600

Audit log immutability: файлы append-only через chattr +a на Linux или NTFS ACL на Windows

Remote access authentication: обязательный MFA для всех Firezone подключений

Update signature: GPG signature verification обязательна перед apply

Network isolation: киоск firewall блокирует все inbound кроме Firezone туннеля

## Troubleshooting

### Wazuh агент не подключается
1. Проверить сеть: `ping wazuh.internal`
2. Проверить auth key в ENV
3. Проверить логи: `/var/ossec/logs/ossec.log`

### Firezone туннель не работает
1. Проверить gateway address
2. Проверить device token
3. Проверить WireGuard: `wg show`

### Update fail
1. Проверить signature verification
2. Проверить rollback в `/var/backups/kiosk-agent`
3. Проверить health endpoint: `curl http://localhost:7070/api/health`
