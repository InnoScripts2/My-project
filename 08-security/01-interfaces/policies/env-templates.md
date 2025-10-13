# ============================================
# .env Templates — Шаблоны переменных окружения
# ============================================
# 
# Этот файл содержит шаблоны для создания .env файлов
# в разных окружениях (DEV, QA, PROD).
# 
# ВАЖНО:
# - Никогда не коммитьте реальные секреты в Git
# - Используйте secure vault для хранения production секретов
# - Разные секреты для каждого окружения
# - Регулярно ротируйте ключи согласно политике

# ============================================
# DEV Environment Template
# ============================================

## Kiosk Runtime
AGENT_ENV=DEV
AGENT_PERSISTENCE=sqlite
AGENT_PORT=7070

## Supabase (DEV project)
SUPABASE_URL=https://dev-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<DEV_SERVICE_ROLE_KEY>
SUPABASE_ANON_KEY=<DEV_ANON_KEY>

## Payment Provider (DEV/Sandbox)
YOOKASSA_SHOP_ID=<DEV_SHOP_ID>
YOOKASSA_SECRET_KEY=<DEV_SECRET_KEY>
YOOKASSA_RETURN_URL=http://localhost:8080/payment-complete
PROVIDER_WEBHOOK_SECRET=<DEV_WEBHOOK_SECRET>
PAYMENTS_PROVIDER=yookassa

## Device Locks (DEV — может быть эмулятор)
LOCK_POLICY_OBD=immediate
LOCK_CONFIGS='[{"deviceType": "thickness", "driverType": "mock", "driverConfig": {}}, {"deviceType": "obd", "driverType": "mock", "driverConfig": {}}]'

## OBD Configuration
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_CONNECT_MAX_DELAY_MS=30000

## Logging
LOG_MIN_LEVEL=debug
LOG_ENABLE_CONSOLE=true

## SMTP (DEV — может быть пустым, симуляция)
# SMTP_HOST=
# SMTP_PORT=587

## Security (DEV)
WAZUH_SERVER=wazuh-dev.internal:1514
WAZUH_AUTH_KEY=<DEV_WAZUH_AUTH_KEY>
FIREZONE_SERVER=firezone-dev.internal
FIREZONE_CONFIG_PATH=/tmp/firezone-dev.json
FIREZONE_STATE_PATH=/tmp/firezone-state-dev.json
GUACAMOLE_URL=https://guacamole-dev.internal:8443
GUACAMOLE_USERNAME=admin
GUACAMOLE_PASSWORD=<DEV_GUACAMOLE_PASSWORD>
MESHCENTRAL_URL=https://meshcentral-dev.internal
MESHCENTRAL_MESH_ID=<DEV_MESH_ID>
GPG_PUBLIC_KEY_PATH=/etc/kiosk/publicKey-dev.pem
AUDIT_LOG_DIR=/tmp/kiosk-audit
AUDIT_LOG_RETENTION_DAYS=30
GITHUB_REPO=InnoScripts2/my-own-service
BACKUP_DIR=/tmp/kiosk-backups
APP_VERSION=0.1.0
# SMTP_USER=
# SMTP_PASS=

## Admin
ADMIN_EMAILS=dev-admin@example.com

## AI Features (DEV)
AI_ENABLE_IN_PROD=false

# ============================================
# QA Environment Template
# ============================================

## Kiosk Runtime
AGENT_ENV=QA
AGENT_PERSISTENCE=supabase
AGENT_PORT=7070

## Supabase (QA project)
SUPABASE_URL=https://qa-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<QA_SERVICE_ROLE_KEY>
SUPABASE_ANON_KEY=<QA_ANON_KEY>

## Payment Provider (QA/Sandbox)
YOOKASSA_SHOP_ID=<QA_SHOP_ID>
YOOKASSA_SECRET_KEY=<QA_SECRET_KEY>
YOOKASSA_RETURN_URL=https://qa-kiosk.example.com/payment-complete
PROVIDER_WEBHOOK_SECRET=<QA_WEBHOOK_SECRET>
PAYMENTS_PROVIDER=yookassa

## Device Locks (QA — реальное железо)
LOCK_POLICY_OBD=immediate
LOCK_CONFIGS='[{"deviceType": "thickness", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB0"}, "autoCloseMs": 30000}, {"deviceType": "obd", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB1"}, "autoCloseMs": 30000}]'

## OBD Configuration
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_CONNECT_MAX_DELAY_MS=30000

## Logging
LOG_MIN_LEVEL=info
LOG_ENABLE_CONSOLE=true

## SMTP (QA — test provider)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=<QA_SMTP_USER>
SMTP_PASS=<QA_SMTP_PASS>

## Admin
ADMIN_EMAILS=qa-admin@example.com

## AI Features (QA)
AI_ENABLE_IN_PROD=false

## Security (QA)
WAZUH_SERVER=wazuh-qa.internal:1514
WAZUH_AUTH_KEY=<QA_WAZUH_AUTH_KEY>
FIREZONE_SERVER=firezone-qa.internal
FIREZONE_CONFIG_PATH=/etc/kiosk/firezone-qa.json
FIREZONE_STATE_PATH=/var/lib/kiosk/firezone-state-qa.json
GUACAMOLE_URL=https://guacamole-qa.internal:8443
GUACAMOLE_USERNAME=admin
GUACAMOLE_PASSWORD=<QA_GUACAMOLE_PASSWORD>
MESHCENTRAL_URL=https://meshcentral-qa.internal
MESHCENTRAL_MESH_ID=<QA_MESH_ID>
GPG_PUBLIC_KEY_PATH=/etc/kiosk/publicKey-qa.pem
AUDIT_LOG_DIR=/var/log/kiosk/audit
AUDIT_LOG_RETENTION_DAYS=90
GITHUB_REPO=InnoScripts2/my-own-service
BACKUP_DIR=/var/backups/kiosk-agent
APP_VERSION=0.1.0

# ============================================
# PROD Environment Template
# ============================================

## Kiosk Runtime
AGENT_ENV=PROD
AGENT_PERSISTENCE=supabase
AGENT_PORT=7070

## Supabase (PROD project)
SUPABASE_URL=https://prod-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<PROD_SERVICE_ROLE_KEY>  # ХРАНИТЬ В VAULT!
SUPABASE_ANON_KEY=<PROD_ANON_KEY>

## Payment Provider (PROD)
YOOKASSA_SHOP_ID=<PROD_SHOP_ID>  # ХРАНИТЬ В VAULT!
YOOKASSA_SECRET_KEY=<PROD_SECRET_KEY>  # ХРАНИТЬ В VAULT!
YOOKASSA_RETURN_URL=https://kiosk.example.com/payment-complete
PROVIDER_WEBHOOK_SECRET=<PROD_WEBHOOK_SECRET>  # ХРАНИТЬ В VAULT!
PAYMENTS_PROVIDER=yookassa

## Device Locks (PROD — реальное железо)
LOCK_POLICY_OBD=immediate
LOCK_CONFIGS='[{"deviceType": "thickness", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB0"}, "autoCloseMs": 30000}, {"deviceType": "obd", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB1"}, "autoCloseMs": 30000}]'

## OBD Configuration
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_CONNECT_MAX_DELAY_MS=30000

## Logging
LOG_MIN_LEVEL=warn
LOG_ENABLE_CONSOLE=false  # Только файловое логирование в PROD

## SMTP (PROD — real provider)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=<PROD_SMTP_USER>  # ХРАНИТЬ В VAULT!
SMTP_PASS=<PROD_SMTP_PASS>  # ХРАНИТЬ В VAULT!

## Admin
ADMIN_EMAILS=admin@example.com,support@example.com

## AI Features (PROD)
AI_ENABLE_IN_PROD=false

## Rate Limiting (PROD)
CLOUD_API_RATE_LIMIT_MAX=100
CLOUD_API_RATE_LIMIT_WINDOW_MS=60000

## HTTPS/TLS (PROD)
# HTTPS_PFX=/path/to/prod-cert.pfx
# HTTPS_PASSPHRASE=<CERT_PASSPHRASE>  # ХРАНИТЬ В VAULT!

## Security (PROD)
WAZUH_SERVER=wazuh.internal:1514
WAZUH_AUTH_KEY=<PROD_WAZUH_AUTH_KEY>  # ХРАНИТЬ В VAULT!
FIREZONE_SERVER=firezone.internal
FIREZONE_CONFIG_PATH=/etc/kiosk/firezone.json
FIREZONE_STATE_PATH=/var/lib/kiosk/firezone-state.json
FIREZONE_DEVICE_TOKEN=<PROD_FIREZONE_TOKEN>  # ХРАНИТЬ В VAULT!
GUACAMOLE_URL=https://guacamole.internal:8443
GUACAMOLE_USERNAME=admin
GUACAMOLE_PASSWORD=<PROD_GUACAMOLE_PASSWORD>  # ХРАНИТЬ В VAULT!
MESHCENTRAL_URL=https://meshcentral.internal
MESHCENTRAL_MESH_ID=<PROD_MESH_ID>  # ХРАНИТЬ В VAULT!
GPG_PUBLIC_KEY_PATH=/etc/kiosk/publicKey.pem
AUDIT_LOG_DIR=/var/log/kiosk/audit
AUDIT_LOG_RETENTION_DAYS=90
GITHUB_REPO=InnoScripts2/my-own-service
BACKUP_DIR=/var/backups/kiosk-agent
INSTALL_DIR=/opt/kiosk/apps/kiosk-agent
APP_VERSION=0.1.0

# ============================================
# Контрольный список безопасности секретов
# ============================================
# [ ] Все секреты PROD хранятся в secure vault (AWS Secrets Manager, HashiCorp Vault)
# [ ] .env файлы в .gitignore (никогда не коммитятся)
# [ ] SERVICE_ROLE_KEY используется только на сервере
# [ ] ANON_KEY используется только на клиенте
# [ ] Разные секреты для DEV/QA/PROD
# [ ] Webhook secrets достаточно сложные (минимум 32 символа)
# [ ] Установлен график ротации секретов
# [ ] HTTPS сертификаты валидны и не истекают
# [ ] SMTP/SMS credentials проверены и работают
# [ ] Rate limiting настроен и протестирован
# [ ] Wazuh agent настроен и подключен к серверу
# [ ] Firezone ZTNA туннель активен и MFA включен
# [ ] Guacamole/MeshCentral remote access настроен
# [ ] Audit logging включен с retention 90 дней
# [ ] GPG public key для signature verification доступен
# [ ] Hardening checks проходят успешно
