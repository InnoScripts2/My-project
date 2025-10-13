# Руководство по автообновлениям и мониторингу

## Обзор

Система автообновлений обеспечивает безопасное, атомарное обновление агента киоска с автоматическим откатом при сбоях. Мониторинг здоровья позволяет отслеживать состояние сервиса и своевременно реагировать на проблемы.

## Архитектура автообновлений

### Slot-based Deployment

Система использует два слота развертывания (A и B):

- **Активный слот** — обслуживает текущий трафик
- **Неактивный слот** — принимает новую версию

### Процесс обновления

1. **Проверка обновлений** — опрос манифеста обновлений из контролируемого источника
2. **Скачивание** — загрузка файлов в неактивный слот
3. **Верификация** — проверка подписи и хэшей файлов
4. **Валидация** — health-check новой версии
5. **Переключение** — атомарная смена активного слота
6. **Откат** — автоматический возврат при сбое health-check

### Manifest формат

```json
{
  "version": "1.2.3",
  "releaseId": "20240101-abc123",
  "timestamp": "2024-01-01T00:00:00Z",
  "files": [
    {
      "path": "dist/index.js",
      "size": 12345,
      "sha256": "abc123..."
    }
  ],
  "signature": "base64-encoded-signature",
  "minVersion": "1.0.0",
  "rolloutPolicy": {
    "strategy": "scheduled",
    "scheduleWindow": {
      "startHour": 2,
      "endHour": 6
    }
  }
}
```

### Политики обновлений

#### Immediate (немедленное)
Обновление применяется сразу после успешной валидации.

```json
{
  "rolloutPolicy": {
    "strategy": "immediate"
  }
}
```

#### Scheduled (по расписанию)
Обновление применяется только в указанное время (например, ночное окно).

```json
{
  "rolloutPolicy": {
    "strategy": "scheduled",
    "scheduleWindow": {
      "startHour": 2,
      "endHour": 6
    }
  }
}
```

#### Gradual (постепенное)
Обновление раскатывается на определенный процент терминалов.

```json
{
  "rolloutPolicy": {
    "strategy": "gradual",
    "gradualPercent": 10
  }
}
```

## Health Endpoints

### `/healthz` — Liveness Probe

Проверяет, жив ли процесс. Всегда возвращает 200, если процесс работает.

**Пример ответа:**
```json
{
  "status": "pass",
  "version": "0.1.0",
  "serviceId": "kiosk-agent",
  "checks": {
    "uptime": {
      "componentType": "system",
      "observedValue": 3600,
      "observedUnit": "seconds",
      "status": "pass"
    },
    "memory": {
      "componentType": "system",
      "observedValue": 45,
      "observedUnit": "percent",
      "status": "pass"
    }
  }
}
```

### `/readyz` — Readiness Probe

Проверяет, готов ли сервис обслуживать запросы. Возвращает 503 при сбое зависимостей.

**Пример ответа:**
```json
{
  "status": "pass",
  "version": "0.1.0",
  "serviceId": "kiosk-agent",
  "checks": {
    "persistence": {
      "componentId": "persistence",
      "componentType": "datastore",
      "observedValue": 15,
      "observedUnit": "ms",
      "status": "pass"
    },
    "memory": {
      "componentType": "system",
      "observedValue": 45,
      "observedUnit": "percent",
      "status": "pass"
    }
  }
}
```

### `/health` — Combined Health Check

Расширенная проверка с системной информацией.

**Пример ответа:**
```json
{
  "status": "pass",
  "version": "0.1.0",
  "serviceId": "kiosk-agent",
  "checks": {
    "persistence": {...},
    "memory": {...}
  },
  "system": {
    "cpu": {
      "usage": 23,
      "cores": 4
    },
    "memory": {
      "totalMb": 8192,
      "usedMb": 3686,
      "freeMb": 4506,
      "usagePercent": 45
    },
    "uptime": 3600,
    "loadAverage": [1.5, 1.2, 0.8]
  }
}
```

## Heartbeat Logging

Heartbeat логирование отслеживает живость процесса.

### Конфигурация

```typescript
import { HeartbeatLogger } from './health/HeartbeatLogger.js';

const heartbeat = new HeartbeatLogger(
  '/var/log/kiosk-agent/heartbeat.jsonl',
  30000 // интервал 30 секунд
);

await heartbeat.start();
```

### Формат записи

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "pid": 1234,
  "uptime": 3600,
  "memoryUsageMb": 128,
  "status": "ok",
  "message": "Service healthy"
}
```

### Ротация логов

Heartbeat автоматически ротирует логи при превышении размера:

```typescript
await heartbeat.rotateIfNeeded(10); // макс. 10 MB
```

## Watchdog

Watchdog-скрипт следит за состоянием сервиса и перезапускает при необходимости.

### Использование

```powershell
# Базовая проверка heartbeat
.\infra\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs/heartbeat.jsonl" `
  -MaxAgeMinutes 5

# С автоматическим перезапуском
.\infra\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs/heartbeat.jsonl" `
  -MaxAgeMinutes 5 `
  -RestartOnFailure

# С проверкой health endpoint
.\infra\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs/heartbeat.jsonl" `
  -HealthUrl "http://localhost:7070/healthz" `
  -RestartOnFailure

# С email алертами
.\infra\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs/heartbeat.jsonl" `
  -MaxAgeMinutes 5 `
  -AlertEmail "ops@example.com" `
  -LogFile "logs/watchdog.log"
```

### Параметры

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `HeartbeatLog` | Путь к heartbeat логу | `logs/heartbeat.jsonl` |
| `MaxAgeMinutes` | Макс. возраст heartbeat | `5` минут |
| `ProcessName` | Имя процесса для проверки | `node` |
| `HealthUrl` | URL health endpoint | `http://localhost:7070/healthz` |
| `RestartOnFailure` | Перезапускать при сбое | `false` |
| `AlertEmail` | Email для алертов | - |
| `LogFile` | Файл логов watchdog | - |
| `EmitJson` | Вывод в JSON | `false` |
| `Quiet` | Тихий режим | `false` |

### Коды возврата

- `0` — Все в порядке
- `1` — Предупреждение (degraded/stale)
- `2` — Критический сбой

## Аварийные уведомления

### Email Alerts

Для отправки email-уведомлений настройте SMTP:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=secret
ALERT_EMAIL=ops@example.com
```

### SMS Alerts

Для SMS используйте провайдера (например, Twilio):

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
ALERT_PHONE=+0987654321
```

### Логирование событий

Критические события логируются в структурированном формате:

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "error",
  "event": "service_failure",
  "details": {
    "reason": "health_check_failed",
    "lastHeartbeat": "2024-01-01T11:55:00Z"
  }
}
```

## Диагностика

### Системная информация

Health endpoints предоставляют системные метрики:

```bash
curl http://localhost:7070/health
```

Ответ содержит:
- Использование CPU (%)
- Использование памяти (MB, %)
- Uptime (секунды)
- Load average

### Управление лог-уровнями

Установить через переменную окружения:

```env
LOG_LEVEL=debug  # debug | info | warn | error
```

Или динамически через API (если реализовано):

```bash
curl -X POST http://localhost:7070/api/log-level \
  -H "Content-Type: application/json" \
  -d '{"level": "debug"}'
```

### Сбор crash-дампов

При крахе процесса Node.js автоматически создает дампы:

```bash
# Включить генерацию core dumps
ulimit -c unlimited

# Путь для дампов
export NODE_REPORT_DIRECTORY=/var/log/kiosk-agent/dumps
```

### Ротация логов

Heartbeat и другие логи автоматически ротируются при превышении размера.

Ручная очистка старых логов:

```bash
find /var/log/kiosk-agent -name "*.log.*.bak" -mtime +30 -delete
```

## Kubernetes Deployment

Пример конфигурации для Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kiosk-agent
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: kiosk-agent
        image: kiosk-agent:latest
        ports:
        - containerPort: 7070
        
        # Liveness probe
        livenessProbe:
          httpGet:
            path: /healthz
            port: 7070
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        # Readiness probe
        readinessProbe:
          httpGet:
            path: /readyz
            port: 7070
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3
        
        # Startup probe
        startupProbe:
          httpGet:
            path: /healthz
            port: 7070
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 30
```

## Процедуры восстановления

### Автоматический откат обновления

При сбое health-check после обновления происходит автоматический откат:

1. Обнаружение сбоя health-check
2. Переключение на предыдущий слот
3. Перезапуск сервиса
4. Логирование причины отката

### Ручной откат

```bash
# Через API
curl -X POST http://localhost:7070/api/autoupdate/rollback \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual rollback by operator"}'
```

### Восстановление после краха

1. Watchdog автоматически перезапускает процесс
2. Проверяется health endpoint
3. При повторных крахах — алерт оператору
4. Оператор анализирует crash dumps и логи

## Мониторинг в Production

### Метрики для отслеживания

- **Uptime** — время работы без перезапусков
- **Heartbeat Age** — возраст последнего heartbeat
- **Health Status** — статус health endpoints
- **Memory Usage** — использование памяти
- **CPU Usage** — использование процессора
- **Restart Count** — количество перезапусков

### Алертинг

Настроить алерты на:

- Heartbeat age > 5 минут
- Health check failed
- Memory usage > 85%
- Более 3 перезапусков за час

### Dashboard

Рекомендуется создать dashboard с:

- График uptime
- График heartbeat age
- График использования ресурсов
- Журнал событий (рестарты, откаты)
- Статус последнего обновления

## FAQ

### Как часто проверять обновления?

Рекомендуется проверять каждые 15-30 минут.

### Когда применять обновления?

В ночное окно (02:00-06:00) для минимизации воздействия на клиентов.

### Что делать при частых перезапусках?

1. Проверить логи на наличие ошибок
2. Проверить crash dumps
3. Убедиться в достаточности ресурсов (CPU, RAM)
4. Проверить состояние зависимостей (БД, внешние API)

### Как проверить статус обновления?

```bash
curl http://localhost:7070/api/autoupdate/status
```

### Как запустить обновление вручную?

```bash
curl -X POST http://localhost:7070/api/autoupdate/trigger
```

## Безопасность

### Подпись обновлений

Все обновления должны быть подписаны приватным ключом:

```bash
# Генерация ключевой пары
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Подпись манифеста
openssl dgst -sha256 -sign private.pem -out signature.bin manifest.json
base64 signature.bin > signature.txt
```

### Верификация

Агент проверяет подпись перед применением обновления:

```typescript
const updateManager = new AutoUpdateManager({
  manifestUrl: 'https://updates.example.com/manifest.json',
  baseDir: '/opt/kiosk-agent',
  publicKeyPath: '/opt/kiosk-agent/public.pem',
  store,
});
```

### Best Practices

1. Хранить приватный ключ в защищенном хранилище
2. Использовать HTTPS для загрузки обновлений
3. Проверять минимальную версию перед обновлением
4. Тестировать обновления в staging перед production
5. Ограничить доступ к API обновлений

## Заключение

Система автообновлений и мониторинга обеспечивает:

✅ Безопасные обновления с автоматическим откатом  
✅ Непрерывный мониторинг здоровья сервиса  
✅ Автоматическое восстановление при сбоях  
✅ Структурированное логирование и алертинг  
✅ Простую диагностику проблем  

Для дополнительной информации см.:
- `docs/tech/MONITORING_OBSERVABILITY_STRATEGY.md`
- `docs/internal/autonomous-updates/README.md`
- `apps/kiosk-agent/src/health/`
- `apps/kiosk-agent/src/autoupdate/`
