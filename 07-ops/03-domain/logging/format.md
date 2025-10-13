# Формат логов — JSON Lines

## Назначение

Описание структурированного формата логов для всех компонентов системы киоска самообслуживания.

## Формат

Все логи пишутся в формате **JSON Lines** (JSONL) — один JSON объект на строку.

### Базовая структура

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Payment intent created",
  "service": "kiosk-agent",
  "environment": "PROD",
  "requestId": "req-abc123",
  "sessionId": "T-20250115-001",
  "component": "payments",
  "data": {
    "intentId": "pi_abc123",
    "amount": 350,
    "currency": "RUB"
  }
}
```

## Обязательные поля

- `timestamp` (ISO 8601) — метка времени события
- `level` — уровень лога: `debug`, `info`, `warn`, `error`, `fatal`
- `message` — человекочитаемое описание события
- `service` — имя сервиса: `kiosk-agent`, `cloud-api`, `frontend`
- `environment` — окружение: `DEV`, `QA`, `PROD`

## Опциональные поля

- `requestId` — идентификатор HTTP-запроса (для трассировки)
- `sessionId` — идентификатор пользовательской сессии
- `component` — модуль/компонент: `payments`, `locks`, `obd`, `thickness`
- `userId` — идентификатор пользователя (анонимизированный)
- `data` — дополнительные структурированные данные
- `error` — объект ошибки (stack trace, code, details)
- `duration` — длительность операции в миллисекундах

## Уровни логов

### debug
Детальная отладочная информация. Только в DEV.

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "debug",
  "message": "OBD command sent",
  "service": "kiosk-agent",
  "component": "obd",
  "data": {
    "command": "AT Z",
    "port": "COM3"
  }
}
```

### info
Информационные события (нормальная работа).

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Lock opened successfully",
  "service": "kiosk-agent",
  "component": "locks",
  "sessionId": "T-20250115-001",
  "data": {
    "deviceType": "thickness",
    "duration": 250
  }
}
```

### warn
Предупреждения (потенциальные проблемы).

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "warn",
  "message": "Payment pending for over 90 seconds",
  "service": "kiosk-agent",
  "component": "payments",
  "sessionId": "T-20250115-001",
  "data": {
    "intentId": "pi_abc123",
    "pendingDuration": 95000
  }
}
```

### error
Ошибки (требуют внимания).

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "error",
  "message": "Lock open failed",
  "service": "kiosk-agent",
  "component": "locks",
  "sessionId": "T-20250115-001",
  "error": {
    "code": "LOCK_MECHANICAL_FAILURE",
    "message": "Device did not respond",
    "stack": "Error: Device did not respond\n    at LockController..."
  },
  "data": {
    "deviceType": "obd",
    "attempts": 3
  }
}
```

### fatal
Критические ошибки (приложение не может продолжать работу).

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "fatal",
  "message": "Database connection lost",
  "service": "cloud-api",
  "error": {
    "code": "ECONNREFUSED",
    "message": "Connection refused"
  }
}
```

## Приватность

**НЕ логируем:**
- Личные данные клиентов (ФИО, email, телефон) — только хэши
- Платёжные данные (номера карт, CVV)
- Пароли, токены, ключи API

**Можно логировать:**
- Идентификаторы сессий
- Метаданные запросов
- Технические параметры

## Хранение и ротация

- Логи пишутся в `/var/log/kiosk/` (production) или `./logs/` (dev)
- Файлы: `kiosk-agent.log`, `cloud-api.log`
- Ротация: ежедневно, сжатие старых логов
- Хранение: 30 дней локально, 90 дней в централизованной системе

## Парсинг

См. `parsers-examples.md` для примеров парсеров (jq, logstash, vector).
