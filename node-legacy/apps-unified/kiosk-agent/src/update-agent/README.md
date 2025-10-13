# Kiosk Update Agent

Фоновый сервис для автоматического обновления киоск-приложений через Supabase.

## Возможности

- **Автоматическая проверка обновлений**: периодическая проверка новых версий (каждые 5 минут)
- **Realtime уведомления**: мгновенное реагирование на публикацию обновлений через Supabase Realtime
- **Heartbeat**: отправка статуса "жив" каждые 30 секунд
- **Telemetry**: буферизованная отправка логов в Supabase
- **Backup и Rollback**: автоматическое создание backup перед обновлением и откат при ошибках
- **Checksum проверка**: SHA-256 верификация загруженных файлов
- **Кросс-платформенность**: поддержка Windows, Linux, macOS

## Архитектура

```
update-agent/
├── config.ts              # Конфигурация (переменные окружения, пути)
├── main.ts                # Главный оркестратор
├── services/
│   ├── supabase.ts        # Supabase клиент и регистрация
│   ├── heartbeat.ts       # Heartbeat сервис (30s interval)
│   ├── telemetry.ts       # Telemetry/логирование (буферизация)
│   └── updater.ts         # Скачивание, проверка, применение обновлений
└── installer/
    ├── windows-service.ts # Windows Service установщик
    └── systemd-service.sh # Linux systemd установщик
```

## Установка

### Переменные окружения

Создайте файл `.env` в корне `kiosk-agent/`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Update Agent
AGENT_ENV=production
APP_VERSION=1.0.0
```

### Установка зависимостей

```bash
cd 03-apps/02-application/kiosk-agent
npm install
```

Требуемые пакеты:
- `@supabase/supabase-js` - Supabase клиент
- `uuid` - генерация уникальных идентификаторов
- `@types/uuid` - TypeScript типы для uuid
- `adm-zip` - распаковка ZIP архивов (для updater)
- `node-windows` - Windows Service (только для Windows)

### Сборка

```bash
npm run build
```

## Запуск

### Development

```bash
# Прямой запуск через Node.js
node dist/update-agent/main.js
```

### Production (Windows Service)

```powershell
# Установить как Windows Service (требуется admin)
node dist/update-agent/installer/windows-service.js install

# Управление сервисом
node dist/update-agent/installer/windows-service.js start
node dist/update-agent/installer/windows-service.js stop
node dist/update-agent/installer/windows-service.js restart
node dist/update-agent/installer/windows-service.js uninstall
```

### Production (Linux systemd)

```bash
# Установить как systemd service (требуется sudo)
sudo bash dist/update-agent/installer/systemd-service.sh install

# Управление сервисом
sudo systemctl start kiosk-update-agent
sudo systemctl stop kiosk-update-agent
sudo systemctl restart kiosk-update-agent
sudo systemctl status kiosk-update-agent

# Логи
sudo journalctl -u kiosk-update-agent -f

# Удалить
sudo bash dist/update-agent/installer/systemd-service.sh uninstall
```

## Конфигурация

Все настройки задаются через переменные окружения:

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `SUPABASE_URL` | URL Supabase проекта | - |
| `SUPABASE_ANON_KEY` | Supabase anon key | - |
| `APP_VERSION` | Текущая версия приложения | `1.0.0` |
| `AGENT_ENV` | Окружение (dev/prod) | `production` |

Автоматически определяемые:
- `CLIENT_ID` - UUID клиента (генерируется и сохраняется в `~/.kiosk-client-id`)
- `PLATFORM` - Платформа (windows/linux/macos)
- `APP_DIR` - Директория приложения
- `TEMP_DIR` - Временные файлы (`~/.kiosk-updates/temp`)
- `BACKUP_DIR` - Backup-ы (`~/.kiosk-updates/backups`)

## Как работает обновление

1. **Проверка**: Агент периодически проверяет наличие новых опубликованных обновлений в Supabase
2. **Скачивание**: Загружает ZIP-файл из Supabase Storage через signed URL
3. **Верификация**: Проверяет SHA-256 checksum файла
4. **Backup**: Создаёт backup текущей версии (сохраняет последние 3 backup)
5. **Применение**: Распаковывает и применяет обновление
6. **Rollback**: При ошибке - автоматически откатывается к последнему backup
7. **Статус**: Обновляет статус деплоймента в таблице `update_deployments`

## Логирование

Telemetry сервис собирает логи и отправляет батчами в Supabase:

- **Уровни**: `info`, `warning`, `error`, `critical`
- **Буферизация**: до 50 записей или 10 секунд
- **Таблица**: `telemetry_logs`

Локальные логи:
- Windows: Event Viewer → Windows Logs → Application (для Windows Service)
- Linux: `journalctl -u kiosk-update-agent`

## Мониторинг

Heartbeat отправляется каждые 30 секунд:
- Обновляет `last_heartbeat` и `last_seen` в таблице `clients`
- Статус клиента автоматически меняется на `offline` если heartbeat пропадает более 2 минут (проверка в Admin Panel)

## Troubleshooting

### Агент не запускается

1. Проверьте `.env` файл (SUPABASE_URL, SUPABASE_ANON_KEY)
2. Проверьте права доступа к директориям (`~/.kiosk-updates/`)
3. Проверьте логи:
   - Windows: Event Viewer
   - Linux: `journalctl -u kiosk-update-agent`

### Обновление не применяется

1. Проверьте статус в Admin Panel → Update Deployments
2. Проверьте telemetry логи в Admin Panel → Telemetry Logs
3. Проверьте checksum файла обновления
4. Убедитесь что у агента есть права записи в `APP_DIR`

### Клиент offline в Admin Panel

1. Проверьте запущен ли агент: `systemctl status kiosk-update-agent` (Linux) или Services (Windows)
2. Проверьте сетевое подключение к Supabase
3. Проверьте не истёк ли API key

## Безопасность

- **API Keys**: Храните `SUPABASE_ANON_KEY` в `.env`, не коммитьте в Git
- **RLS Policies**: Включены в Supabase для защиты данных
- **Checksum**: Обязательная проверка SHA-256 перед применением обновлений
- **Backup**: Автоматический backup перед каждым обновлением

## TODO

- [ ] Добавить распаковку ZIP (сейчас заглушка, нужен `adm-zip`)
- [ ] Реализовать graceful restart приложения после обновления
- [ ] Добавить macOS launchd installer
- [ ] Добавить прогресс-бар скачивания в telemetry
- [ ] Добавить webhook уведомления об успешных/неудачных обновлениях
- [ ] Добавить rate limiting для предотвращения DoS при массовых обновлениях

## Лицензия

Proprietary - Автосервис самообслуживания
