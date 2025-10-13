# Backoffice Documentation

Документация для внутренних систем и процессов киоск-агента.

## Архитектура

Киоск-агент состоит из следующих основных модулей:

- **Sessions** - управление сессиями клиентов с автоматическим таймаутом
- **Payments** - платежная интеграция (DEV/PROD режимы)
- **Reports** - генерация и доставка отчетов (PDF, email, SMS)
- **Metrics** - Prometheus метрики для мониторинга

## Конфигурация

Конфигурация системы находится в `config/service.json` и переменных окружения.

### Переменные окружения

```bash
# Базовые настройки
AGENT_ENV=DEV                    # DEV или PROD
PORT=3000                        # Порт API сервера

# Платежи (YooKassa для PROD)
YOOKASSA_SHOP_ID=               # ID магазина YooKassa
YOOKASSA_SECRET_KEY=            # Секретный ключ YooKassa

# Email (SMTP или SendGrid)
EMAIL_PROVIDER=smtp             # smtp, sendgrid, или dev
EMAIL_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SENDGRID_API_KEY=

# SMS (Twilio или SMSC)
SMS_PROVIDER=dev                # twilio, smsc, или dev
SMS_FROM=+79000000000
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

### Конфигурационный файл

Файл `config/service.json` содержит настройки по умолчанию для всех модулей.

## Хранилище

### База данных SQLite

База данных `storage/core.sqlite` содержит следующие таблицы:

- `sessions` - активные и завершенные сессии
- `payments` - записи платежей
- `reports` - метаданные отчетов
- `audit_logs` - журнал аудита

### Миграции

Миграции находятся в директории `migrations/`:

- `001_initial_schema.sql` - начальная схема БД

### Файловое хранилище

- `storage/reports/` - сгенерированные PDF отчеты
- `storage/core.sqlite` - база данных SQLite

## API Эндпоинты

### Sessions API

```
POST   /api/sessions              - Создать новую сессию
GET    /api/sessions/:id          - Получить сессию
PATCH  /api/sessions/:id          - Обновить сессию
POST   /api/sessions/:id/complete - Завершить сессию
POST   /api/sessions/:id/expire   - Истечь сессию
GET    /api/sessions              - Список сессий (с фильтрами)
DELETE /api/sessions/:id          - Удалить сессию
```

### Payments API

```
POST   /api/payments/intent           - Создать платежное намерение
GET    /api/payments/status/:id       - Получить статус платежа
GET    /api/payments/intent/:id       - Получить детали платежа
POST   /api/payments/cancel/:id       - Отменить платеж
POST   /api/payments/confirm/:id      - Подтвердить платеж (DEV only)
POST   /api/payments/webhook          - Webhook для PSP (PROD)
```

### Reports API

```
POST   /api/reports/diagnostics       - Создать отчет диагностики
POST   /api/reports/thickness         - Создать отчет толщинометрии
GET    /api/reports/:id               - Получить отчет
GET    /api/reports/session/:id       - Список отчетов по сессии
```

### Metrics API

```
GET    /metrics                       - Prometheus метрики
```

## Примеры использования

### Создание сессии

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "diagnostics",
    "contact": {
      "email": "client@example.com",
      "phone": "+79001234567"
    },
    "metadata": {
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry"
    }
  }'
```

### Создание платежа

```bash
curl -X POST http://localhost:3000/api/payments/intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 48000,
    "currency": "RUB",
    "sessionId": "OBD-xxx-yyy",
    "metadata": {
      "service": "diagnostics"
    }
  }'
```

### Генерация отчета

```bash
curl -X POST http://localhost:3000/api/reports/diagnostics \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "sessionId": "OBD-xxx-yyy",
      "vehicleMake": "Toyota",
      "vehicleModel": "Camry",
      "dtcCodes": [
        {
          "code": "P0420",
          "description": "Catalyst System Efficiency Below Threshold",
          "severity": "medium"
        }
      ],
      "timestamp": "2025-01-15T10:30:00Z"
    },
    "deliverTo": {
      "email": "client@example.com",
      "phone": "+79001234567"
    }
  }'
```

## Мониторинг и метрики

### Prometheus метрики

Агент экспортирует следующие метрики:

#### Платежи
- `payments_intents_total` - Всего платежных намерений
- `payments_confirmed_total` - Подтвержденных платежей
- `payments_failed_total` - Неудачных платежей
- `payments_duration_seconds` - Длительность обработки платежа
- `payments_webhook_received_total` - Webhook-ов получено

#### Сессии
- `sessions_created_total` - Создано сессий
- `sessions_completed_total` - Завершено сессий
- `sessions_expired_total` - Истекло сессий
- `sessions_duration_seconds` - Длительность сессии
- `sessions_active` - Активных сессий (gauge)

#### Диагностика
- `diagnostics_scans_total` - Всего сканирований
- `diagnostics_dtc_found_total` - Найдено DTC кодов
- `diagnostics_duration_seconds` - Длительность диагностики

#### Отчеты
- `reports_generated_total` - Сгенерировано отчетов
- `reports_delivered_total` - Доставлено отчетов
- `reports_failed_total` - Неудачных доставок

### Grafana дашборды

Рекомендуемые панели для мониторинга:

1. **Общая статистика**
   - Активные сессии
   - Успешные платежи за последний час
   - Средняя длительность диагностики

2. **Платежи**
   - Rate успешных/неудачных платежей
   - Средняя сумма чека
   - Conversion rate (сессии -> платежи)

3. **Производительность**
   - Длительность операций (p50, p95, p99)
   - Количество ошибок
   - Rate limit violations

## Запуск и развертывание

### Разработка

```bash
# Установить зависимости
npm install

# Запустить в DEV режиме
npm run dev

# Запустить тесты
npm test
```

### Production

```bash
# Собрать проект
npm run build

# Запустить production сервер
npm start
```

### Docker

```bash
# Собрать образ
docker build -t kiosk-agent .

# Запустить контейнер
docker run -d \
  -p 3000:3000 \
  -e AGENT_ENV=PROD \
  -e YOOKASSA_SHOP_ID=xxx \
  -e YOOKASSA_SECRET_KEY=yyy \
  -v $(pwd)/storage:/app/storage \
  kiosk-agent
```

## Обслуживание

### Резервное копирование

База данных SQLite должна копироваться регулярно:

```bash
# Backup базы данных
sqlite3 storage/core.sqlite ".backup storage/core.backup.sqlite"

# Backup отчетов
tar -czf reports-backup-$(date +%Y%m%d).tar.gz storage/reports/
```

### Очистка старых данных

Устаревшие данные автоматически удаляются:

- Истекшие сессии (старше 24 часов)
- Истекшие платежи (старше 1 часа)
- Audit logs (старше 90 дней)

Для ручной очистки:

```bash
# Очистка старых отчетов (старше 30 дней)
find storage/reports -type f -mtime +30 -delete
```

### Логирование

Логи выводятся в stdout/stderr и могут быть собраны через:

- Docker logs
- Systemd journal
- Syslog
- Файловый лог-аггрегатор

## Безопасность

### Секреты

Все секреты должны храниться в переменных окружения, НЕ в коде:

- API ключи платежных систем
- SMTP пароли
- Database credentials

### Аудит

Все критичные операции логируются в таблицу `audit_logs`:

- Создание/изменение платежей
- Завершение сессий
- Генерация отчетов

### Rate Limiting

API защищен от abuse:

- Максимум 10 createIntent за минуту от одного IP
- Webhook endpoint с валидацией подписи

## Troubleshooting

### Частые проблемы

**Проблема**: Платежи не подтверждаются в PROD

**Решение**: 
1. Проверить настройки webhook в YooKassa
2. Убедиться, что webhook URL доступен из интернета
3. Проверить валидность secretKey

**Проблема**: Email не отправляются

**Решение**:
1. Проверить EMAIL_PROVIDER в .env
2. Для SMTP: проверить доступность хоста и порта
3. Для SendGrid: проверить API ключ

**Проблема**: База данных заблокирована

**Решение**:
```bash
# Проверить процессы, использующие БД
lsof storage/core.sqlite

# Если нужно, удалить lock файлы
rm -f storage/core.sqlite-wal storage/core.sqlite-shm
```

## Поддержка

Для вопросов и поддержки:

- GitHub Issues: https://github.com/InnoScripts2/my-own-service/issues
- Документация: /docs
- Техподдержка: support@autoservice.local
