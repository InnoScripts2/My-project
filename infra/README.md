# Infrastructure

Production deployment infrastructure для киоск-агента.

## Структура

```
infra/
├── docker/              # Docker инфраструктура
│   ├── Dockerfile       # Production Docker образ
│   ├── docker-compose.yml  # Оркестрация сервисов
│   ├── prometheus.yml   # Конфигурация Prometheus
│   ├── alertmanager.yml # Конфигурация Alertmanager
│   ├── nginx.conf       # Nginx reverse proxy
│   └── ssl/            # SSL сертификаты
├── systemd/            # Systemd service файлы
│   ├── kiosk-agent.service       # Основной сервис
│   └── kiosk-docker.service      # Docker Compose сервис
├── scripts/            # Скрипты развертывания
│   ├── deploy.sh       # Linux развертывание
│   └── deploy.ps1      # Windows развертывание
└── monitoring/         # Мониторинг и алерты
    ├── grafana/        # Grafana конфигурация
    └── README.md       # Руководство по мониторингу
```

## Быстрый старт

### Docker развертывание (рекомендуется)

```bash
cd infra/docker
cp .env.example .env
nano .env  # настроить переменные
docker compose up -d
```

### Systemd развертывание

```bash
sudo bash infra/scripts/deploy.sh
```

## Документация

- [Deployment Guide](../docs/tech/deployment.md) - Полное руководство по развертыванию
- [Docker README](docker/README.md) - Docker инфраструктура
- [Monitoring README](monitoring/README.md) - Мониторинг и алерты

## Компоненты

### Docker Infrastructure
- Multistage Dockerfile для оптимизированного production build
- Docker Compose с полным стеком (agent, Prometheus, Grafana, Nginx)
- SSL support с Let's Encrypt или self-signed сертификатами
- Health checks и auto-restart политики

### Systemd Services
- Native Linux service для direct deployment
- Автозапуск при загрузке системы
- Управление через systemctl
- Интеграция с journald для логирования

### Monitoring Stack
- Prometheus для сбора метрик
- Grafana для визуализации
- Alertmanager для управления алертами
- Pre-configured дашборды и alert rules

### Deployment Scripts
- Автоматизированное развертывание для Linux и Windows
- Проверка prerequisites
- Установка зависимостей
- Настройка прав доступа
- Service installation и запуск

## CI/CD

GitHub Actions workflows для автоматизации:
- `agent-ci.yml` - Lint, test, build, Docker image publish
- `agent-cd.yml` - Deployment в staging/production

## Требования

- Node.js 20.x LTS
- Docker 24.x+ и Docker Compose 2.x+ (для Docker deployment)
- systemd (для Linux systemd deployment)
- 2GB RAM минимум, 4GB рекомендуется
- 20GB disk space минимум

## Поддержка

Для вопросов и проблем см. [Deployment Guide](../docs/tech/deployment.md)
