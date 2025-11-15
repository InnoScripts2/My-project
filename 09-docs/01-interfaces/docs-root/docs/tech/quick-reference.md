# Infrastructure Quick Reference

Быстрый справочник команд для работы с инфраструктурой киоск-агента.

## Docker Commands

### Сборка и запуск

```bash
# Сборка образа
docker build -t kiosk-agent:latest -f infra/docker/Dockerfile .

# Запуск всех сервисов
cd infra/docker
docker compose up -d

# Только агент
docker compose up -d kiosk-agent

# Остановка
docker compose down

# Перезапуск
docker compose restart kiosk-agent
```

### Логи

```bash
# Все логи
docker compose logs -f

# Логи агента
docker compose logs -f kiosk-agent

# Последние 100 строк
docker compose logs --tail=100 kiosk-agent
```

### Проверка статуса

```bash
# Статус контейнеров
docker compose ps

# Использование ресурсов
docker stats

# Health check
curl http://localhost:7070/api/health
```

## Systemd Commands

### Управление сервисом

```bash
# Запустить
sudo systemctl start kiosk-agent

# Остановить
sudo systemctl stop kiosk-agent

# Перезапустить
sudo systemctl restart kiosk-agent

# Статус
sudo systemctl status kiosk-agent

# Включить автозапуск
sudo systemctl enable kiosk-agent

# Отключить автозапуск
sudo systemctl disable kiosk-agent
```

### Логи

```bash
# Живые логи
sudo journalctl -u kiosk-agent -f

# Последние 100 строк
sudo journalctl -u kiosk-agent -n 100

# За последний час
sudo journalctl -u kiosk-agent --since "1 hour ago"

# Только ошибки
sudo journalctl -u kiosk-agent -p err
```

## Развертывание

### Linux (автоматическое)

```bash
sudo bash infra/scripts/deploy.sh
```

### Windows (автоматическое)

```powershell
.\infra\scripts\deploy.ps1
```

### Ручное развертывание

```bash
# Клонировать репозиторий
git clone https://github.com/InnoScripts2/my-own-service.git
cd my-own-service/apps/kiosk-agent

# Установить зависимости
npm ci

# Собрать
npm run build

# Запустить
npm start
```

## Мониторинг

### Endpoints

```bash
# Agent health
curl http://localhost:7070/api/health

# Metrics
curl http://localhost:7070/metrics

# Prometheus
open http://localhost:9090

# Grafana
open http://localhost:3001
```

### Health check скрипт

```bash
bash infra/scripts/healthcheck.sh
```

## Backup & Restore

### Бэкап

```bash
# SQLite база
cp /opt/kiosk-agent/data/kiosk.db /backup/kiosk.db.$(date +%Y%m%d)

# Docker volumes
docker run --rm -v kiosk-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/kiosk-data-backup.tar.gz -C /data .

# Конфигурация
tar czf kiosk-config-backup.tar.gz /opt/kiosk-agent/.env /opt/kiosk-agent/config/
```

### Восстановление

```bash
# Остановить сервис
sudo systemctl stop kiosk-agent

# Восстановить базу
cp /backup/kiosk.db.20240101 /opt/kiosk-agent/data/kiosk.db

# Восстановить конфигурацию
tar xzf kiosk-config-backup.tar.gz -C /

# Запустить сервис
sudo systemctl start kiosk-agent
```

## Troubleshooting

### Порт занят

```bash
# Найти процесс
sudo lsof -i :7070
sudo ss -tuln | grep 7070

# Убить процесс
sudo kill -9 <PID>
```

### Высокое потребление памяти

```bash
# Проверить память
ps aux | grep node

# Перезапустить
sudo systemctl restart kiosk-agent

# Настроить лимит
sudo systemctl edit kiosk-agent
# Добавить: [Service]
#           MemoryLimit=1G
```

### База данных заблокирована

```bash
# Проверить блокировки
sudo lsof /opt/kiosk-agent/data/kiosk.db

# Убить процесс
sudo kill -9 <PID>

# Проверить права
sudo chown -R kiosk:kiosk /opt/kiosk-agent/data/
```

### Модули не найдены

```bash
# Переустановить зависимости
cd /opt/kiosk-agent
sudo rm -rf node_modules package-lock.json
sudo npm ci --production
sudo chown -R kiosk:kiosk node_modules
```

## Update

### Docker

```bash
cd infra/docker
git pull origin main
docker compose build
docker compose up -d
```

### Systemd

```bash
# Остановить
sudo systemctl stop kiosk-agent

# Обновить код
cd /tmp/my-own-service
git pull origin main
cd apps/kiosk-agent
npm ci
npm run build

# Копировать
sudo rsync -av dist/ /opt/kiosk-agent/dist/
cd /opt/kiosk-agent
sudo npm ci --production

# Запустить
sudo systemctl start kiosk-agent
```

## Rollback

### Git rollback

```bash
# Посмотреть историю
git log --oneline -10

# Откатиться
git checkout <commit-hash>

# Пересобрать и развернуть
npm ci && npm run build
sudo systemctl restart kiosk-agent
```

### Tag rollback

```bash
# Откатиться на тег
git checkout v1.0.0

# Пересобрать и развернуть
npm ci && npm run build
sudo systemctl restart kiosk-agent
```

## Environment Variables

### Обязательные

```env
NODE_ENV=production
AGENT_ENV=PROD
AGENT_PORT=7070
```

### Опциональные

```env
DATABASE_URL=/app/data/kiosk.db
LOG_LEVEL=info
OBD_EMULATOR_ENABLED=false
```

## Полезные ссылки

- [Deployment Guide](deployment.md)
- [CI/CD Guide](ci-cd.md)
- [Docker README](../infra/docker/README.md)
- [Monitoring README](../infra/monitoring/README.md)
