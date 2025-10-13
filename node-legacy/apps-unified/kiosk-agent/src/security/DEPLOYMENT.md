# Security Deployment Guide

Пошаговая инструкция по развертыванию полного стека безопасности киоска.

## Фазы развертывания

### Фаза 1: Базовое hardening (1 неделя)

#### 1.1 Подготовка системы

Windows:
```powershell
# Создать пользователя киоска
New-LocalUser -Name "kiosk" -NoPassword
Add-LocalGroupMember -Group "Users" -Member "kiosk"

# Настроить Assigned Access (Kiosk Mode)
Set-AssignedAccess -AppUserModelId Microsoft.WindowsCalculator_8wekyb3d8bbwe!App -UserName kiosk

# Настроить автовход
$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $RegPath -Name "AutoAdminLogon" -Value "1"
Set-ItemProperty -Path $RegPath -Name "DefaultUserName" -Value "kiosk"
```

Linux:
```bash
# Создать пользователя киоска
sudo useradd -m -s /bin/bash kiosk

# Настроить автовход (для LightDM)
sudo nano /etc/lightdm/lightdm.conf
# [Seat:*]
# autologin-user=kiosk
# autologin-user-timeout=0

# Ограничить права
sudo chmod 700 /home/kiosk

# Отключить sudo для kiosk
sudo visudo
# kiosk ALL=(ALL) NOPASSWD: NONE
```

#### 1.2 Конфигурация firewall

Windows:
```powershell
# Разрешить только необходимые порты
New-NetFirewallRule -DisplayName "Kiosk Agent" -Direction Inbound -LocalPort 7070 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Block All Inbound" -Direction Inbound -Action Block

# Разрешить outbound только к trusted endpoints
New-NetFirewallRule -DisplayName "Allow HTTPS" -Direction Outbound -RemotePort 443 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Allow HTTP" -Direction Outbound -RemotePort 80 -Protocol TCP -Action Allow
```

Linux:
```bash
# Установить iptables
sudo apt-get install iptables-persistent

# Разрешить только необходимые порты
sudo iptables -A INPUT -p tcp --dport 22 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 7070 -j ACCEPT
sudo iptables -A INPUT -j DROP

# Разрешить outbound к trusted endpoints
sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 1514 -j ACCEPT  # Wazuh

# Сохранить правила
sudo netfilter-persistent save
```

#### 1.3 Запуск hardening checks

```bash
cd /home/runner/work/my-own-service/my-own-service/03-apps/02-application/kiosk-agent
npm run dev

# В другом терминале
curl http://localhost:7070/api/security/hardening | jq '.'
```

Проверить отчет:
- Все OS checks должны быть passed или warning
- Network checks должны показывать активный firewall
- User checks должны показывать unprivileged user

### Фаза 2: Wazuh SIEM (1 неделя)

#### 2.1 Установка Wazuh Server

```bash
# На выделенном сервере
curl -sO https://packages.wazuh.com/4.x/wazuh-install.sh
sudo bash wazuh-install.sh -a
```

Сохранить admin credentials из вывода.

#### 2.2 Установка Wazuh Agent на киоске

Linux:
```bash
wget https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.5.0-1_amd64.deb
sudo dpkg -i wazuh-agent_4.5.0-1_amd64.deb

# Получить auth key с Wazuh Manager
sudo /var/ossec/bin/agent-auth -m wazuh-server-ip -A kiosk-location-1
```

Windows:
```powershell
Invoke-WebRequest -Uri https://packages.wazuh.com/4.x/windows/wazuh-agent-4.5.0-1.msi -OutFile wazuh-agent.msi
msiexec /i wazuh-agent.msi /q WAZUH_MANAGER="wazuh-server-ip" WAZUH_REGISTRATION_SERVER="wazuh-server-ip"
```

#### 2.3 Конфигурация агента через API

```typescript
import { WazuhAgent } from './security';

const wazuh = new WazuhAgent();
await wazuh.configureAgent({
  serverAddress: 'wazuh.internal:1514',
  authKey: process.env.WAZUH_AUTH_KEY,
  groups: ['kiosks', 'prod', 'location-1'],
  policies: [
    {
      name: 'FIM',
      enabled: true,
      settings: {
        directories: [
          '/opt/kiosk/apps/kiosk-agent/src',
          '/opt/kiosk/apps/kiosk-frontend',
          '/opt/kiosk/config'
        ],
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
```

#### 2.4 Проверка статуса

```bash
curl http://localhost:7070/api/security/wazuh/status | jq '.'
```

### Фаза 3: Firezone ZTNA (1 неделя)

#### 3.1 Установка Firezone Server

```bash
# На выделенном сервере
curl -fsSL https://github.com/firezone/firezone/releases/latest/download/install.sh | sudo bash

# Следовать инструкциям для настройки PostgreSQL и конфигурации
```

#### 3.2 Установка WireGuard на киоске

Linux:
```bash
sudo apt-get install wireguard
```

Windows:
```powershell
Invoke-WebRequest -Uri https://download.wireguard.com/windows-client/wireguard-installer.exe -OutFile wireguard.exe
.\wireguard.exe /S
```

#### 3.3 Регистрация ресурса

```typescript
import { FirezoneClient } from './security';

const firezone = new FirezoneClient();
const result = await firezone.registerResource(
  process.env.KIOSK_ID,
  `Kiosk-${process.env.LOCATION}`,
  ['kiosk', 'prod', process.env.LOCATION]
);

console.log('Resource ID:', result.resourceId);
console.log('Device Token:', result.deviceToken);

await firezone.updateAccessPolicy(result.resourceId, {
  allowedRoles: ['operator', 'admin'],
  mfaRequired: true,
  sessionTimeout: 60,
  timeRestrictions: {
    allowedDays: [1, 2, 3, 4, 5],
    allowedHours: { start: 8, end: 20 }
  }
});
```

#### 3.4 Настройка MFA

В Firezone Web UI:
1. Users → Select User → Enable MFA
2. Scan QR code с Authy или Google Authenticator
3. Verify code

#### 3.5 Тест подключения

```bash
curl http://localhost:7070/api/security/firezone/status | jq '.'
```

### Фаза 4: Remote Access (1 неделя)

#### 4.1 Установка Guacamole Server

```bash
# Docker compose
cat > docker-compose.yml <<EOF
version: '3'
services:
  guacamole:
    image: guacamole/guacamole
    ports:
      - "8443:8080"
    environment:
      GUACD_HOSTNAME: guacd
      MYSQL_HOSTNAME: mysql
      MYSQL_DATABASE: guacamole_db
      MYSQL_USER: guacamole_user
      MYSQL_PASSWORD: secure_password
    depends_on:
      - guacd
      - mysql
  
  guacd:
    image: guacamole/guacd
  
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: guacamole_db
      MYSQL_USER: guacamole_user
      MYSQL_PASSWORD: secure_password
EOF

docker-compose up -d
```

#### 4.2 Установка MeshCentral Agent

На киоске:
```bash
# Скачать installer с MeshCentral Server Web UI
wget https://meshcentral.internal/meshagents?id=<mesh-id> -O meshagent
chmod +x meshagent
sudo ./meshagent -install
```

#### 4.3 Настройка операторского доступа

Операторы устанавливают Firezone client и подключаются:
```bash
# Linux
sudo apt-get install wireguard
sudo wg-quick up firezone

# Windows
# Импортировать конфигурацию в WireGuard GUI
```

После подключения через VPN:
- Guacamole: https://guacamole.internal:8443
- MeshCentral: https://meshcentral.internal

### Фаза 5: Audit Logging и Monitoring (1 неделя)

#### 5.1 Настройка audit logging

```bash
# Создать директорию
sudo mkdir -p /var/log/kiosk/audit
sudo chown kiosk:kiosk /var/log/kiosk/audit
sudo chmod 700 /var/log/kiosk/audit

# Настроить append-only (Linux)
sudo chattr +a /var/log/kiosk/audit/audit-*.log
```

#### 5.2 Настройка cron для cleanup

```bash
sudo crontab -e -u kiosk

# Cleanup старых логов ежедневно в 4 AM
0 4 * * * /opt/kiosk/scripts/cleanup-audit-logs.sh
```

cleanup-audit-logs.sh:
```bash
#!/bin/bash
cd /opt/kiosk/apps/kiosk-agent
node -e "
import { AuditLogger } from './src/security/index.js';
const logger = new AuditLogger();
logger.cleanupOldLogs(90).then(count => console.log('Cleaned up ' + count + ' files'));
"
```

#### 5.3 Настройка Prometheus scraping

prometheus.yml:
```yaml
scrape_configs:
  - job_name: 'kiosk-agent'
    static_configs:
      - targets: ['kiosk-1.internal:7070']
        labels:
          location: 'location-1'
    metrics_path: '/metrics'
```

#### 5.4 Настройка Alertmanager

alertmanager.yml:
```yaml
route:
  receiver: 'security-team'
  group_by: ['alertname', 'severity']
  routes:
    - match:
        severity: critical
      receiver: 'security-team-pager'

receivers:
  - name: 'security-team'
    email_configs:
      - to: 'security@example.com'
  
  - name: 'security-team-pager'
    pagerduty_configs:
      - service_key: '<pagerduty-key>'
```

### Фаза 6: Updates и Production Readiness (1 неделя)

#### 6.1 Генерация GPG ключей

```bash
# Генерация keypair для signing
gpg --full-generate-key

# Экспорт public key
gpg --armor --export security@example.com > publicKey.pem

# Копировать на киоск
sudo cp publicKey.pem /etc/kiosk/publicKey.pem
sudo chown root:root /etc/kiosk/publicKey.pem
sudo chmod 444 /etc/kiosk/publicKey.pem
```

#### 6.2 Создание release с signature

```bash
# Создать artifact
cd /opt/kiosk
tar -czf kiosk-agent-v1.0.0.tar.gz apps/kiosk-agent

# Подписать
gpg --detach-sign --armor kiosk-agent-v1.0.0.tar.gz

# Загрузить на GitHub Releases
gh release create v1.0.0 \
  kiosk-agent-v1.0.0.tar.gz \
  kiosk-agent-v1.0.0.tar.gz.asc \
  --title "Release v1.0.0" \
  --notes "Production release"
```

#### 6.3 Тест обновления

```bash
curl -X POST http://localhost:7070/api/admin/update/check | jq '.'
curl -X POST http://localhost:7070/api/admin/update/apply \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0", "scheduledTime": "2025-01-16T03:00:00Z"}' | jq '.'
```

## Production Checklist

- [ ] Hardening checks все passed
- [ ] Wazuh agent подключен и отправляет алерты
- [ ] Firezone tunnel активен, MFA работает
- [ ] Guacamole RDP/SSH доступ работает через VPN
- [ ] MeshCentral agent установлен и подключен
- [ ] Audit logs пишутся корректно
- [ ] Cleanup job настроен и работает
- [ ] Prometheus metrics экспортируются
- [ ] Alertmanager алерты настроены
- [ ] GPG signature verification работает
- [ ] Update flow протестирован в staging
- [ ] Rollback механизм протестирован
- [ ] Документация актуальна
- [ ] Operators обучены работе с remote access
- [ ] Incident response runbook готов

## Troubleshooting

### Wazuh agent не подключается
```bash
# Проверить статус
sudo /var/ossec/bin/wazuh-control status

# Проверить логи
sudo tail -f /var/ossec/logs/ossec.log

# Перезапустить
sudo /var/ossec/bin/wazuh-control restart
```

### Firezone tunnel не работает
```bash
# Проверить WireGuard
sudo wg show

# Проверить конфигурацию
cat /etc/kiosk/firezone.json

# Тест connectivity
ping firezone.internal
```

### Update fail rollback
```bash
# Посмотреть backup
ls -lh /var/backups/kiosk-agent

# Ручной rollback
cd /var/backups/kiosk-agent
sudo tar -xzf kiosk-agent-v0.1.0-*.tar.gz -C /opt/kiosk/apps/kiosk-agent
sudo systemctl restart kiosk-agent
```

## Support

Контакты:
- Security Lead: security@example.com
- Operations: ops@example.com
- Emergency: +7-XXX-XXX-XXXX
