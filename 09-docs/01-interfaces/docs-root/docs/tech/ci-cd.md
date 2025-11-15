# CI/CD Pipeline Documentation

Автоматизация сборки, тестирования и развертывания киоск-агента через GitHub Actions.

## Workflows

### 1. agent-ci.yml - Continuous Integration

Запускается при:
- Push в ветки `main` и `develop`
- Pull requests в `main` и `develop`
- Изменения в `apps/kiosk-agent/**` или `packages/**`

#### Шаги

**Lint Job:**
- Checkout кода
- Установка Node.js 20
- Установка зависимостей
- Запуск ESLint

**Test Job:**
- Checkout кода
- Установка Node.js 20
- Установка зависимостей
- Запуск тестов

**Build Job:**
- Checkout кода
- Установка Node.js 20
- Установка зависимостей
- Сборка TypeScript
- Upload артефактов (dist/, package.json)

**Build Docker Job:**
- Checkout кода
- Настройка Docker Buildx
- Login в GitHub Container Registry
- Сборка и публикация Docker образа
- Кеширование слоев для ускорения

#### Образы

Публикуются в GitHub Container Registry:
```
ghcr.io/innoscripts2/my-own-service/kiosk-agent:main
ghcr.io/innoscripts2/my-own-service/kiosk-agent:main-<sha>
```

### 2. agent-cd.yml - Continuous Deployment

Запускается при:
- Push тегов `v*.*.*`
- Push в ветку `main`
- Ручной запуск (workflow_dispatch)

#### Шаги

**Deploy to Staging:**
- Автоматически при push в `main`
- Сборка приложения
- Создание deployment package
- Upload на staging сервер (требуется настройка SSH)

**Deploy to Production:**
- Автоматически при создании тега `v*.*.*`
- Или ручной запуск для production environment
- Сборка приложения
- Запуск production тестов
- Создание release package
- Создание GitHub Release
- Deployment на production сервер (требуется настройка SSH)

**Rollback Production:**
- Ручной запуск через workflow_dispatch
- Откат на предыдущую версию

## Настройка Secrets

### Staging

В настройках репозитория (Settings → Secrets → Actions) добавить:

```
STAGING_HOST=staging.kiosk.local
STAGING_USER=deploy
STAGING_SSH_KEY=<private SSH key>
```

### Production

```
PROD_HOST=kiosk.local
PROD_USER=deploy
PROD_SSH_KEY=<private SSH key>
```

### Grafana

```
GRAFANA_ADMIN_PASSWORD=<secure password>
```

## Environments

Настроить environments в репозитории (Settings → Environments):

### staging
- URL: https://staging.kiosk.local
- Protection rules: опционально

### production
- URL: https://kiosk.local
- Protection rules:
  - Required reviewers (рекомендуется)
  - Wait timer (опционально)
  - Deployment branches: только `main` и теги

## SSH Access Setup

### 1. Генерация SSH ключей

```bash
# На локальной машине
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key
```

### 2. Установка публичного ключа на сервере

```bash
# На staging/production сервере
mkdir -p ~/.ssh
cat github_deploy_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 3. Добавление приватного ключа в GitHub Secrets

```bash
# Скопировать содержимое приватного ключа
cat ~/.ssh/github_deploy_key
# Добавить в GitHub Secrets как STAGING_SSH_KEY или PROD_SSH_KEY
```

### 4. Тестирование подключения

```bash
ssh -i ~/.ssh/github_deploy_key deploy@staging.kiosk.local
```

## Deployment Commands

### Staging Deployment

```bash
# SSH в staging сервер
ssh deploy@staging.kiosk.local

# Развертывание
cd /opt/kiosk-agent
git pull origin main
npm ci --production
sudo systemctl restart kiosk-agent
```

### Production Deployment

```bash
# SSH в production сервер
ssh deploy@prod.kiosk.local

# Развертывание
cd /opt/kiosk-agent
git pull origin v1.0.0  # или конкретный тег
npm ci --production
sudo systemctl restart kiosk-agent

# Проверка
sudo systemctl status kiosk-agent
curl http://localhost:7070/api/health
```

## Manual Workflow Dispatch

### Deploy to Staging

```bash
# Через GitHub UI
1. Navigate to Actions tab
2. Select "Kiosk Agent CD" workflow
3. Click "Run workflow"
4. Select branch: main
5. Environment: staging
6. Click "Run workflow"
```

### Deploy to Production

```bash
# Через GitHub CLI
gh workflow run agent-cd.yml -f environment=production

# Или через UI
1. Navigate to Actions tab
2. Select "Kiosk Agent CD" workflow
3. Click "Run workflow"
4. Select branch: main or tag
5. Environment: production
6. Click "Run workflow"
```

### Rollback

```bash
# Через GitHub UI
1. Navigate to Actions tab
2. Select "Kiosk Agent CD" workflow
3. Click "Run workflow"
4. Select rollback job
5. Click "Run workflow"
```

## Release Process

### 1. Подготовка релиза

```bash
# Убедиться что все изменения в main
git checkout main
git pull origin main

# Проверить что CI прошел
# Проверить что staging работает
```

### 2. Создание тега

```bash
# Создать тег
git tag -a v1.0.0 -m "Release version 1.0.0"

# Push тега
git push origin v1.0.0
```

### 3. Автоматическое развертывание

После push тега:
1. Запускается workflow agent-cd.yml
2. Собирается приложение
3. Запускаются production тесты
4. Создается GitHub Release с артефактами
5. Выполняется deployment на production

### 4. Проверка

```bash
# Проверить GitHub Release
# Проверить production deployment в Actions
# Проверить health endpoint
curl https://kiosk.local/api/health

# Проверить метрики
curl https://kiosk.local/metrics

# Проверить логи
ssh deploy@prod.kiosk.local "sudo journalctl -u kiosk-agent -n 100"
```

## Troubleshooting

### Workflow Failed

1. **Проверить логи:**
   - Navigate to Actions tab
   - Click на failed workflow run
   - Expand failed step
   - Review logs

2. **Общие проблемы:**
   - Node modules не установлены: `npm ci` failed
   - TypeScript errors: проверить типы
   - Test failures: исправить тесты
   - Docker build failed: проверить Dockerfile

### SSH Connection Failed

```bash
# Проверить secrets
# Settings → Secrets → Actions

# Проверить формат SSH ключа
# Должен включать BEGIN и END markers

# Проверить права на сервере
ls -la ~/.ssh/authorized_keys

# Проверить SSH конфигурацию сервера
sudo systemctl status sshd
```

### Deployment Failed

```bash
# Проверить логи на сервере
sudo journalctl -u kiosk-agent -n 100

# Проверить статус сервиса
sudo systemctl status kiosk-agent

# Проверить доступность
curl http://localhost:7070/api/health

# Ручной rollback
cd /opt/kiosk-agent
git checkout <previous-tag>
npm ci --production
sudo systemctl restart kiosk-agent
```

### Docker Image Not Found

```bash
# Проверить Container Registry permissions
# Settings → Packages → kiosk-agent → Settings
# Ensure "Inherit access from repository" is enabled

# Проверить published образы
docker pull ghcr.io/innoscripts2/my-own-service/kiosk-agent:latest

# Login в GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

## Monitoring CI/CD

### Metrics

GitHub Actions предоставляет метрики:
- Workflow duration
- Success/failure rates
- Queue times

### Notifications

Настроить уведомления:
1. Watch repository
2. Settings → Notifications
3. Enable "Actions" notifications

### Status Badge

Добавить в README.md:
```markdown
[![CI](https://github.com/InnoScripts2/my-own-service/workflows/Kiosk%20Agent%20CI/badge.svg)](https://github.com/InnoScripts2/my-own-service/actions)
```

## Best Practices

1. **Always test on staging first**
2. **Use semantic versioning for tags**
3. **Write meaningful commit messages**
4. **Review deployment logs**
5. **Monitor production after deployment**
6. **Keep rollback plan ready**
7. **Document breaking changes**
8. **Test rollback procedure periodically**

## Security

1. **Rotate SSH keys regularly**
2. **Use least-privilege access**
3. **Enable branch protection**
4. **Require code reviews**
5. **Scan for vulnerabilities**
6. **Keep secrets secure**
7. **Audit deployment logs**

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Action](https://github.com/docker/build-push-action)
- [Deployment Documentation](deployment.md)
