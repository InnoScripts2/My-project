# Backlog для трекера задач: внедрение безопасности обновлений

Документ предназначен для оперативного занесения задач в Azure Boards/Jira. Каждая запись содержит предлагаемые поля: `Title`, `Description`, `Owner`, `Due`, `Tags`.

## 1. Ключевая инфраструктура

### Task: Secure offline storage for private key
- **Description**: Подготовить аппаратный сейф с шифрованием диска для хранения приватного Ed25519 ключа. Настроить журнал доступа с процедурой two-person rule.
- **Owner**: Lead инфраструктуры, Release инженер
- **Due**: 2025-10-20
- **Tags**: security, key-management

### Task: Publish public key to agent configs
- **Description**: Добавить `keys/public_ed25519.pem` в репозиторий конфигурации агента и pipeline фронтенда, обеспечить доставку на киоски.
- **Owner**: DevOps
- **Due**: 2025-10-17
- **Tags**: agent, config, security

### Task: Schedule annual key rotation
- **Description**: Настроить напоминание в Azure DevOps/Calendar, подготовить процедуру `key rollover`, указать ответственных.
- **Owner**: Release инженер
- **Due**: 2025-11-01
- **Tags**: key-management, schedule

## 2. Репозиторий обновлений

### Task: Enforce MFA on package storage
- **Description**: Настроить bucket/Blob `dtc-packages` с MFA delete/RBAC, ограничить доступ согласно требованиям.
- **Owner**: DevOps
- **Due**: 2025-10-24
- **Tags**: infrastructure, storage, security

### Task: Enable access logging for package storage
- **Description**: Включить S3 Access Logs или Azure Storage Diagnostics, настроить экспорт в SIEM (`logs/update-distribution`).
- **Owner**: SecOps
- **Due**: 2025-10-24
- **Tags**: logging, siem

### Task: Configure retention policy for package storage
- **Description**: Настроить lifecycle (Glacier/Azure Archive) с хранением 24 месяца.
- **Owner**: Infra
- **Due**: 2025-10-31
- **Tags**: retention, storage

## 3. Киоск: кэш и офлайн-доставка

### Task: Implement kiosk update cache fallback
- **Description**: Добавить tmpfs→disk fallback для `/data/updates/dtc`, провести тест на сбой питания.
- **Owner**: Команда агент
- **Due**: 2025-10-28
- **Tags**: agent, reliability

### Task: Enforce dual-file verification on kiosk
- **Description**: Встроить проверку архива и подписи в агенте при USB-импорте (поверх `verify_package.py`).
- **Owner**: Команда агент
- **Due**: 2025-10-18
- **Tags**: agent, security

### Task: Provision quarantine directory
- **Description**: Создать `/data/updates/quarantine`, настроить ротацию логов и политики очистки.
- **Owner**: Команда агент
- **Due**: 2025-10-28
- **Tags**: agent, operations

## 4. Аудит и журналы

### Task: Define update-agent.log format and shipping
- **Description**: Утвердить JSONL формат, подключить shipper для отправки в центральное хранилище.
- **Owner**: Agent, SecOps
- **Due**: 2025-10-22
- **Tags**: logging, agent

### Task: Maintain signing.log in secure vault
- **Description**: Развернуть защищённое хранилище для `logs/signing.log`, определить процедуру выгрузки и проверки.
- **Owner**: Release инженер
- **Due**: 2025-10-20
- **Tags**: security, logging

### Task: Select retention storage for audit logs
- **Description**: Выбрать хранилище (Azure Log Analytics/Loki), задокументировать процедуру удаления по истечении 24 месяцев.
- **Owner**: SecOps
- **Due**: 2025-10-31
- **Tags**: retention, logging

## 5. Ротация и отзыв ключей

### Task: Deliver revoked-keys.json distribution
- **Description**: Реализовать JSON `revoked-keys.json`, настроить доставку на агенты и CDN.
- **Owner**: DevOps, Agent
- **Due**: 2025-11-07
- **Tags**: key-management, security

### Task: Document re-signing checklist
- **Description**: Дополнить `docs/internal/update-playbook.md` разделом «Инциденты» с процедурой переупаковки.
- **Owner**: Release инженер
- **Due**: 2025-10-25
- **Tags**: incident-response

## 6. Инцидент-менеджмент

### Task: Configure incident runbook and paging
- **Description**: Настроить runbook остановки выпуска, интеграцию с PagerDuty, шаблон уведомления операторов.
- **Owner**: SecOps
- **Due**: 2025-10-25
- **Tags**: incident-response

### Task: Prepare operator communication templates
- **Description**: Создать email- и SMS-шаблоны уведомлений в CRM, задокументировать процедуру.
- **Owner**: Support
- **Due**: 2025-10-25
- **Tags**: communications, incident-response

---

После импорта задач обновите статусы в `docs/tech/update-security-implementation-plan.md` и приложите ссылки на карточки в `docs/internal/update-security-meeting-notes-20251015.md`.

Для быстрой загрузки в трекер используйте скрипт `python tools/security/export_security_backlog.py --timestamp --azure-csv outbox/security-backlog-tasks-azure.csv`, который генерирует `outbox/security-backlog-tasks.json` и CSV-файл для импорта `outbox/security-backlog-tasks-azure.csv`.
