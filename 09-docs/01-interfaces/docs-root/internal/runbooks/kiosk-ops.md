# Kiosk Operations Runbook

Быстрый справочник для операторов терминала автосервиса самообслуживания.

## Оглавление
- [Быстрая диагностика](#быстрая-диагностика)
- [Перезапуск компонентов](#перезапуск-компонентов)
- [Смена сервера](#смена-сервера)
- [Сбор логов](#сбор-логов)
- [Мониторинг и метрики](#мониторинг-и-метрики)
- [Частые проблемы](#частые-проблемы)

---

## Быстрая диагностика

### Проверка статуса всех компонентов

#### 1. Проверка kiosk-agent (локальный сервис)
\`\`\`bash
# Windows PowerShell
curl http://localhost:7070/health/integrations | ConvertFrom-Json | Format-List
\`\`\`

**Ожидаемый ответ:**
\`\`\`json
{
  "ok": true,
  "checks": {
    "supabase": { "status": "ok", "latency": 150 },
    "edgeFunction": { "status": "ok", "latency": 250 }
  }
}
\`\`\`

#### 2. Проверка cloud-api (если используется)
\`\`\`bash
curl http://your-cloud-api-url/health
curl http://your-cloud-api-url/readiness
\`\`\`

#### 3. Проверка Frontend
- Откройте браузер на \`http://localhost:8080\` или \`http://localhost:7070\`
- Проверьте консоль браузера (F12) на ошибки

### Индикаторы проблем

❌ **Проблема:** \`"ok": false\` в health check  
✅ **Действие:** Проверьте конкретный \`check\`, который failed

❌ **Проблема:** Supabase "not_configured"  
✅ **Действие:** Проверьте переменные окружения

❌ **Проблема:** Высокий latency (> 1000ms)  
✅ **Действие:** Проверьте сетевое подключение, перезапустите компоненты

---

## Перезапуск компонентов

### kiosk-agent (локальный Node.js сервис)

#### Windows
\`\`\`powershell
# Остановить (если запущен в PowerShell)
Ctrl+C

# Запустить
cd apps\kiosk-agent
npm run dev
\`\`\`

### Frontend (статический сервер)

#### Локальный запуск
\`\`\`powershell
# Остановить: Ctrl+C
# Запустить
npm run static
\`\`\`

---

## Смена сервера

### Через UI (Frontend)

1. Нажмите \`Ctrl+Shift+S\` (или кнопку ⚙️)
2. Введите Supabase URL и Anon Key
3. Нажмите "Сохранить"

### Через переменные окружения (kiosk-agent)

Отредактируйте \`.env\`:
\`\`\`bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
AGENT_PERSISTENCE=supabase
\`\`\`

Перезапустите kiosk-agent.

---

## Сбор логов

### Kiosk-agent
\`\`\`powershell
Get-Content "logs/self-check/obd/*.json" -Tail 50
\`\`\`

### Frontend (браузер)
1. F12 → Console
2. Network tab для HTTP запросов

### Cloud API
\`\`\`bash
docker logs kiosk-cloud-api --tail 100
\`\`\`

---

## Мониторинг и метрики

### Prometheus
\`\`\`bash
curl http://localhost:7070/metrics
curl http://your-cloud-api:7071/metrics
\`\`\`

**Ключевые метрики:**
- \`supabase_operations_total\` — операции с БД
- \`supabase_operation_duration_seconds\` — latency
- \`payments_created_total\` — платежи

---

## Частые проблемы

### OBD адаптер не подключается
1. Проверьте USB/Bluetooth
2. Запустите самопроверку: \`npm run self-check:obd -- --port COM3\`

### Платежи не проходят (DEV)
1. Используйте кнопку "Подтвердить оплату (DEV)"
2. Убедитесь что \`AGENT_ENV=DEV\`

### Frontend не загружается
1. F12 → Console для ошибок
2. Проверьте что kiosk-agent запущен: \`curl http://localhost:7070/health/integrations\`

---

**Версия:** 0.1.0 (Pre-release)  
**Последнее обновление:** 2025-01-05
