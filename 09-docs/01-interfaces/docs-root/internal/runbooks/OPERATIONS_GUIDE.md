# Операционное руководство для администраторов

## Быстрый старт

### Запуск сервиса

```bash
# Запуск в DEV режиме
npm run dev

# Запуск в production
AGENT_ENV=PROD npm --prefix 03-apps/02-application/kiosk-agent start
```

### Проверка здоровья сервиса

```bash
# Liveness - процесс жив?
curl http://localhost:7070/healthz

# Readiness - готов обслуживать запросы?
curl http://localhost:7070/readyz

# Полная проверка с системными метриками
curl http://localhost:7070/health
```

## Мониторинг

### Проверка heartbeat

```bash
# Последний heartbeat
tail -1 logs/heartbeat.jsonl | jq .

# История за последние 5 минут
cat logs/heartbeat.jsonl | jq 'select(.timestamp > "'$(date -u -d '5 minutes ago' +%FT%TZ)'")' 
```

### Запуск watchdog

```powershell
# Базовая проверка
.\06-infra\04-infrastructure\infra-root\scripts\enhanced-watchdog.ps1 -HeartbeatLog "logs\heartbeat.jsonl"

# С автоматическим перезапуском
.\06-infra\04-infrastructure\infra-root\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs\heartbeat.jsonl" `
  -RestartOnFailure

# С проверкой health endpoint
.\06-infra\04-infrastructure\infra-root\scripts\enhanced-watchdog.ps1 `
  -HeartbeatLog "logs\heartbeat.jsonl" `
  -HealthUrl "http://localhost:7070/healthz" `
  -RestartOnFailure
```

### Настройка автоматического мониторинга

Добавьте в Task Scheduler (Windows):

```powershell
# Создать задание, которое запускает watchdog каждые 5 минут
schtasks /create /tn "KioskAgentWatchdog" /tr "powershell.exe -File C:\path\to\06-infra\04-infrastructure\infra-root\scripts\enhanced-watchdog.ps1 -HeartbeatLog C:\path\to\logs\heartbeat.jsonl -RestartOnFailure -Quiet" /sc minute /mo 5
```

## Автообновления

### Проверка статуса

```bash
curl http://localhost:7070/api/autoupdate/status
```

### Ручной запуск проверки обновлений

```bash
curl -X POST http://localhost:7070/api/autoupdate/check
```

### Применение обновления

```bash
curl -X POST http://localhost:7070/api/autoupdate/trigger
```

### Откат обновления

```bash
curl -X POST http://localhost:7070/api/autoupdate/rollback \
  -H "Content-Type: application/json" \
  -d '{"reason": "Rollback by operator - version incompatible"}'
```

## Диагностика проблем

### Высокое использование памяти

1. Проверьте метрики:
```bash
curl http://localhost:7070/health | jq '.system.memory'
```

2. Если > 85%, рассмотрите перезапуск:
```powershell
# Graceful shutdown
Stop-Service KioskAgent

# Или через API
curl -X POST http://localhost:7070/api/shutdown
```

3. Проверьте утечки памяти в логах

### Сервис не отвечает

1. Проверьте heartbeat:
```bash
tail -1 logs/heartbeat.jsonl
```

2. Если heartbeat устарел (> 2 минут):
```powershell
# Проверить процесс
Get-Process node

# Перезапустить
Restart-Service KioskAgent
```

3. Проверьте логи на наличие ошибок:
```bash
tail -100 logs/agent.log | grep ERROR
```

### Проблемы с БД/Persistence

1. Проверьте health endpoint:
```bash
curl http://localhost:7070/readyz | jq '.checks.persistence'
```

2. Если fail:
   - Проверьте доступность БД
   - Проверьте credentials в `.env`
   - Проверьте сетевое подключение

3. Временное решение - переключитесь на in-memory:
```bash
AGENT_PERSISTENCE=memory npm start
```

### Частые перезапуски

1. Проверьте crash dumps:
```bash
ls -lt logs/dumps/
```

2. Проверьте системные ресурсы:
```bash
curl http://localhost:7070/health | jq '.system'
```

3. Проверьте watchdog logs:
```powershell
Get-Content logs\watchdog.log | Select-Object -Last 50
```

## Логи

### Структура логов

```
logs/
  ├── heartbeat.jsonl          # Heartbeat записи
  ├── heartbeat.jsonl.*.bak    # Ротированные heartbeat
  ├── agent.log                # Основные логи агента
  ├── watchdog.log             # Логи watchdog
  └── dumps/                   # Crash dumps
```

### Чтение логов

```bash
# Последний heartbeat
tail -1 logs/heartbeat.jsonl | jq .

# Все error логи за последний час
grep ERROR logs/agent.log | tail -100

# Heartbeat с ошибками
cat logs/heartbeat.jsonl | jq 'select(.status != "ok")'
```

### Ротация логов

Логи автоматически ротируются при превышении размера. Для ручной очистки:

```bash
# Удалить старые бэкапы (старше 30 дней)
find logs -name "*.bak" -mtime +30 -delete

# Очистить crash dumps (старше 7 дней)
find logs/dumps -type f -mtime +7 -delete
```

## Переменные окружения

### Основные

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `AGENT_ENV` | Режим работы (DEV/QA/PROD) | `DEV` |
| `AGENT_PORT` | Порт сервера | `7070` |
| `AGENT_PERSISTENCE` | Тип хранилища (memory/pg/supabase) | `memory` |
| `LOG_LEVEL` | Уровень логирования | `info` |

### Heartbeat

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `HEARTBEAT_LOG_FILE` | Путь к heartbeat логу | `logs/heartbeat.jsonl` |
| `HEARTBEAT_INTERVAL_MS` | Интервал heartbeat (мс) | `30000` |

### Auto-update

| Переменная | Описание |
|------------|----------|
| `UPDATE_MANIFEST_URL` | URL манифеста обновлений |
| `UPDATE_PUBLIC_KEY_PATH` | Путь к публичному ключу для проверки подписи |
| `UPDATE_BASE_DIR` | Базовая директория для слотов |

## Maintenance Tasks

### Еженедельно

- [ ] Проверить логи на предмет аномалий
- [ ] Проверить использование дисковогопространства
- [ ] Проверить heartbeat age (должен быть < 2 мин)
- [ ] Очистить старые логи и dumps

### Ежемесячно

- [ ] Проверить доступные обновления
- [ ] Проверить сертификаты (если используется HTTPS)
- [ ] Обновить зависимости (проверка безопасности)
- [ ] Протестировать процедуру восстановления

### При инциденте

1. **Сохраните состояние:**
   - Скопируйте логи
   - Скопируйте crash dumps
   - Сохраните метрики (snapshot health endpoint)

2. **Восстановите сервис:**
   - Попробуйте graceful restart
   - Если не помогает - hard restart
   - Если проблема повторяется - откатите последнее обновление

3. **Расследуйте:**
   - Проанализируйте логи
   - Проверьте crash dumps
   - Проверьте изменения окружения

4. **Документируйте:**
   - Запишите причину
   - Запишите решение
   - Обновите runbook при необходимости

## Контакты и эскалация

### Уровни поддержки

**L1 (Базовая диагностика)**
- Проверка health endpoints
- Перезапуск сервисов
- Проверка логов

**L2 (Глубокая диагностика)**
- Анализ crash dumps
- Проблемы с БД/интеграциями
- Проблемы с обновлениями

**L3 (Разработка)**
- Баги в коде
- Архитектурные проблемы
- Критичные security issues

### Экстренные контакты

- **On-call инженер:** [Telegram/Phone]
- **Email поддержки:** ops@example.com
- **Issue tracker:** GitHub Issues

## Полезные ссылки

- [Полное руководство по автообновлениям и health](./AUTOUPDATE_HEALTH_GUIDE.md)
- [Стратегия мониторинга](./MONITORING_OBSERVABILITY_STRATEGY.md)
- [Архитектура системы](./architecture.md)
- [Внутренние процедуры](../internal/autonomous-updates/README.md)

## FAQ

**Q: Как часто должен обновляться heartbeat?**  
A: Каждые 30 секунд по умолчанию. Если возраст > 2 минут - проблема.

**Q: Что делать если health check показывает 'degraded'?**  
A: Это предупреждение. Проверьте детали в `checks` объекте. Сервис работает, но есть проблемы.

**Q: Можно ли применить обновление в рабочее время?**  
A: Зависит от rollout policy. Scheduled обновления применяются только в заданное окно (обычно ночью).

**Q: Сколько места занимают логи?**  
A: ~1-5 MB в день для heartbeat, зависит от нагрузки для остальных логов. Ротация происходит автоматически.

**Q: Как откатить обновление вручную?**  
A: Используйте API `/api/autoupdate/rollback` или остановите сервис и переключите симлинк на предыдущий слот.
