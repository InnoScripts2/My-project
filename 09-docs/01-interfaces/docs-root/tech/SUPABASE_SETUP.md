# Настройка Supabase — Полное руководство

Этот документ описывает полный процесс настройки Supabase для проекта «Автосервис самообслуживания»: создание проекта, настройка ключей, применение миграций, развертывание Edge Functions и интеграция платежного провайдера.

## Содержание

1. [Создание проекта Supabase](#1-создание-проекта-supabase)
2. [Получение API ключей](#2-получение-api-ключей)
3. [Настройка локальной среды](#3-настройка-локальной-среды)
4. [Применение миграций](#4-применение-миграций)
5. [Развертывание Edge Functions](#5-развертывание-edge-functions)
6. [Настройка платежного провайдера](#6-настройка-платежного-провайдера)
7. [Проверка и тестирование](#7-проверка-и-тестирование)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Создание проекта Supabase

### 1.1. Регистрация и создание проекта

1. Перейдите на [supabase.com](https://supabase.com)
2. Войдите в аккаунт или зарегистрируйтесь
3. Нажмите **"New Project"**
4. Заполните форму:
   - **Name**: `kiosk-selfservice` (или любое имя)
   - **Database Password**: Сгенерируйте надежный пароль и сохраните его
   - **Region**: Выберите ближайший регион (например, `Europe West (London)` для РФ)
   - **Pricing Plan**: Выберите подходящий план (Free для разработки)
5. Нажмите **"Create new project"**
6. Дождитесь завершения инициализации проекта (~2 минуты)

### 1.2. Сохранение Project Reference

После создания проекта найдите **Project Reference** (например, `bzlkzulejwzoqdnmudmm`) на странице проекта. Это понадобится для подключения CLI.

---

## 2. Получение API ключей

### 2.1. Где найти ключи

1. Откройте свой проект в Supabase Dashboard
2. Перейдите в **Settings** → **API**
3. Найдите следующие ключи:

#### SUPABASE_URL
```
https://<your-project-id>.supabase.co
```

#### SUPABASE_ANON_KEY (Public/Anonymous Key)
- Используется во **фронтенде** для чтения публичных VIEW
- Доступ ограничен Row Level Security (RLS) политиками
- **Безопасно** публиковать в клиентском коде

Пример:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0...
```

#### SUPABASE_SERVICE_ROLE_KEY (Service Role Key)
- Используется **ТОЛЬКО на серверах** (kiosk-agent, cloud-api, Edge Functions)
- Минует RLS и имеет полный доступ ко всем таблицам
- **НИКОГДА НЕ ПЕРЕДАВАТЬ** во фронтенд или Android APK
- **КРИТИЧНО**: Храните как секрет!

Пример:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM4MDk0NSwiZXhwIjoyMDc0OTU2OTQ1fQ...
```

### 2.2. Сохранение ключей в .env

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Откройте `.env` и заполните значения:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here
```

**⚠️ ВАЖНО:**
- `.env` включен в `.gitignore` и не должен попадать в Git
- Распространяйте ключи только через защищенные каналы (1Password, Vault, личные сообщения)
- Service Role Key — **строго конфиденциально**

---

## 3. Настройка локальной среды

### 3.1. Установка Supabase CLI

**Windows (PowerShell):**
```powershell
scoop install supabase
```

**macOS (Homebrew):**
```bash
brew install supabase/tap/supabase
```

**Linux:**
```bash
npm install -g supabase
```

Проверка установки:
```bash
supabase --version
```

### 3.2. Вход в Supabase CLI

```bash
supabase login
```

Откроется браузер для авторизации. После успешного входа токен сохранится локально.

### 3.3. Связывание с проектом

```bash
supabase link --project-ref <your-project-ref>
```

Где `<your-project-ref>` — это ID проекта из шага 1.2 (например, `bzlkzulejwzoqdnmudmm`).

Введите database password (из шага 1.1) при запросе.

**Проверка связывания:**
```bash
supabase projects list
```

Ваш проект должен быть отмечен как linked.

---

## 4. Применение миграций

### 4.1. Обзор миграций

Все миграции находятся в `supabase/migrations/`:

- `20251002101636_*.sql` — AI таблицы (conversations, messages, user_data)
- `20251002101807_*.sql` — Исправление триггеров updated_at
- `20251002103431_*.sql` — Основные таблицы (sessions, payments, reports, etc.)
- `20251003020604_*.sql` — Дополнительные таблицы и политики
- `20251004000000_secure_rls_policies.sql` — **КРИТИЧНО** для production: защищённые RLS политики
- `20251005000000_add_performance_indexes.sql` — Индексы для производительности
- `20250106000000_create_webhook_events_and_rpc.sql` — **НОВОЕ**: Таблица для webhook событий

### 4.2. Применение всех миграций

**Автоматически (рекомендуется):**
```bash
supabase db push
```

Эта команда применит все миграции из `supabase/migrations/` к связанному проекту.

**Вручную через Dashboard:**

Если CLI недоступен:

1. Откройте **SQL Editor** в Supabase Dashboard
2. Скопируйте содержимое каждой миграции по порядку
3. Выполните каждую миграцию кнопкой **Run**
4. Убедитесь, что нет ошибок

**Проверка применения:**
```bash
supabase db diff
```

Если вывод пустой — все миграции применены корректно.

### 4.3. Проверка таблиц

После миграций должны быть созданы следующие таблицы:

- `sessions`
- `thickness_points`
- `diagnostics_events`
- `reports`
- `payments`
- `equipment_status`
- `vehicles`
- `customers`
- `diagnostics_codes`
- `webhook_events` ← **НОВАЯ**
- `ai_conversations`, `ai_messages`, `user_data`

Проверить можно в **Table Editor** в Dashboard или через SQL:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

---

## 5. Развертывание Edge Functions

### 5.1. Обзор функций

В проекте есть 2 Edge Functions:

1. **ai-chat** — AI-ассистент (уже развернут)
2. **payments-webhook** — **НОВАЯ** функция для обработки платежных вебхуков с HMAC валидацией

### 5.2. Развертывание payments-webhook

```bash
supabase functions deploy payments-webhook --project-ref <your-project-ref> --no-verify-jwt
```

**Флаги:**
- `--no-verify-jwt`: Функция не требует JWT токена (webhook приходит от внешнего провайдера)
- `--project-ref`: ID вашего проекта

**Проверка развертывания:**

Функция должна появиться в **Database → Functions** в Dashboard.

URL функции:
```
https://<your-project-id>.supabase.co/functions/v1/payments-webhook
```

### 5.3. Настройка переменных функции

Перейдите в **Dashboard → Edge Functions → payments-webhook → Settings → Secrets**.

Добавьте переменную окружения:

| Name | Value |
|------|-------|
| `PROVIDER_WEBHOOK_SECRET` | `<ваш-секрет-от-провайдера>` |

**Как получить секрет:**
- Зависит от вашего платежного провайдера
- Обычно находится в разделе "Webhooks" или "API Keys" в панели провайдера
- Генерируется провайдером специально для подписи webhook запросов

**Примечание:**
- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` доступны автоматически в среде Edge Function
- Не требуется их явно устанавливать

---

## 6. Настройка платежного провайдера

### 6.1. Получение webhook URL

После развертывания функции ваш webhook URL:

```
https://<your-project-id>.supabase.co/functions/v1/payments-webhook
```

### 6.2. Регистрация webhook у провайдера

**Примеры для популярных провайдеров:**

#### Для Stripe:
1. Откройте [Stripe Dashboard](https://dashboard.stripe.com)
2. Перейдите в **Developers → Webhooks**
3. Нажмите **Add endpoint**
4. Укажите URL: `https://<your-project-id>.supabase.co/functions/v1/payments-webhook`
5. Выберите события для прослушивания: `payment_intent.succeeded`, `payment_intent.failed`
6. Скопируйте **Signing Secret** и сохраните как `PROVIDER_WEBHOOK_SECRET`

#### Для ЮKassa:
1. Откройте [ЮKassa Панель](https://yookassa.ru/my)
2. Перейдите в **Настройки → Уведомления**
3. Укажите URL для HTTP-уведомлений
4. Скопируйте секретный ключ для подписи

#### Общий процесс:
1. Найдите раздел Webhooks в панели провайдера
2. Укажите URL вашей Edge Function
3. Настройте заголовок подписи: `x-provider-signature` (проверьте документацию провайдера)
4. Сохраните секрет в переменных Edge Function (шаг 5.3)

### 6.3. Формат webhook запроса

Ваша Edge Function ожидает:

**Headers:**
- `Content-Type: application/json`
- `x-provider-signature: <hmac-sha256-hex-signature>`

**Body (JSON):**
```json
{
  "event_type": "payment.succeeded",
  "payment_id": "pi_123456789",
  "status": "succeeded",
  "amount": 350,
  "currency": "RUB",
  "metadata": {
    "session_id": "sess_abc123"
  }
}
```

**Подпись HMAC SHA-256:**
```
HMAC-SHA256(raw_body, PROVIDER_WEBHOOK_SECRET) → hex string
```

---

## 7. Проверка и тестирование

### 7.1. Тест Edge Function (без подписи)

**Тестовый запрос (curl):**

```bash
curl -X POST \
  https://<your-project-id>.supabase.co/functions/v1/payments-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "payment.test",
    "payment_id": "test_123",
    "status": "succeeded",
    "amount": 100
  }'
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "event_id": "<uuid>",
  "message": "Webhook processed successfully"
}
```

### 7.2. Проверка записи в БД

**SQL запрос:**
```sql
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;
```

Должна появиться запись с `event_type = "payment.test"`.

### 7.3. Тест с HMAC подписью

**Генерация подписи (Node.js):**

```javascript
const crypto = require('crypto');

const body = JSON.stringify({
  event_type: "payment.test",
  payment_id: "test_123",
  status: "succeeded",
  amount: 100
});

const secret = 'your-webhook-secret-here';
const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

console.log('Signature:', signature);
```

**Curl с подписью:**
```bash
curl -X POST \
  https://<your-project-id>.supabase.co/functions/v1/payments-webhook \
  -H "Content-Type: application/json" \
  -H "x-provider-signature: <generated-signature>" \
  -d '<body>'
```

**Ожидаемый результат:**
- Подпись корректна → `200 OK`
- Подпись неверна → `401 Unauthorized`

### 7.4. Проверка безопасности RLS

**Анонимный доступ (должен работать только SELECT):**

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://<your-project-id>.supabase.co',
  '<your-anon-key>'
)

// Должно работать: SELECT из VIEW
const { data, error } = await supabase
  .from('v_sessions_public')
  .select('*')

console.log('SELECT:', data, error)

// Должно вернуть ошибку: INSERT в таблицу
const { error: insertError } = await supabase
  .from('sessions')
  .insert({ kind: 'thickness' })

console.log('INSERT error:', insertError) // Ожидается: RLS policy violation
```

### 7.5. Проверка service role

**Service role (должен иметь полный доступ):**

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  'https://<your-project-id>.supabase.co',
  '<your-service-role-key>',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Должно работать: INSERT в таблицу
const { data, error } = await supabaseService
  .from('sessions')
  .insert({ kind: 'thickness' })
  .select()

console.log('Service INSERT:', data, error) // Должно быть успешно
```

---

## 8. Troubleshooting

### 8.1. Миграции не применяются

**Проблема:** `supabase db push` возвращает ошибки.

**Решения:**
1. Убедитесь, что связка с проектом установлена: `supabase projects list`
2. Проверьте database password
3. Проверьте, что миграции не содержат синтаксических ошибок
4. Применяйте миграции вручную через SQL Editor, чтобы увидеть конкретную ошибку

### 8.2. Edge Function не деплоится

**Проблема:** `supabase functions deploy` возвращает ошибку.

**Решения:**
1. Убедитесь, что `supabase login` выполнен
2. Проверьте, что `--project-ref` правильный
3. Проверьте логи функции в Dashboard → Functions → payments-webhook → Logs
4. Проверьте синтаксис TypeScript в `index.ts`

### 8.3. Webhook возвращает 500

**Проблема:** Webhook запрос завершается с ошибкой.

**Решения:**
1. Проверьте логи функции в Dashboard → Functions → payments-webhook → Logs
2. Убедитесь, что `PROVIDER_WEBHOOK_SECRET` установлен
3. Убедитесь, что таблица `webhook_events` создана
4. Проверьте формат запроса (должен быть JSON)

### 8.4. HMAC подпись не проходит

**Проблема:** Webhook возвращает 401 Unauthorized.

**Решения:**
1. Убедитесь, что используете тот же секрет, что и в переменных Edge Function
2. Проверьте, что подпись генерируется от raw body (не от JSON object)
3. Убедитесь, что используется HMAC-SHA256 и результат в hex-формате
4. Проверьте, что провайдер отправляет подпись в заголовке `x-provider-signature`

### 8.5. Anon key имеет доступ на запись

**Проблема:** Фронтенд может записывать данные с anon key.

**Решения:**
1. Убедитесь, что миграция `20251004000000_secure_rls_policies.sql` применена
2. Проверьте политики RLS: `SELECT * FROM pg_policies WHERE schemaname = 'public'`
3. Пересоздайте политики вручную из миграции
4. Проверьте, что используете anon key (не service role key) во фронтенде

### 8.6. Медленные запросы

**Проблема:** Запросы к Supabase занимают > 1 секунды.

**Решения:**
1. Убедитесь, что миграция `20251005000000_add_performance_indexes.sql` применена
2. Проверьте plan запроса: `EXPLAIN ANALYZE SELECT ...`
3. Добавьте индексы на часто используемые колонки
4. Используйте VIEW вместо прямых запросов к таблицам

---

## Итоговый чеклист настройки

- [ ] Создан проект Supabase
- [ ] Получены и сохранены API ключи в `.env`
- [ ] Установлен и настроен Supabase CLI
- [ ] Связка с проектом (`supabase link`)
- [ ] Применены все миграции (`supabase db push`)
- [ ] Проверены таблицы и политики RLS
- [ ] Развернута Edge Function `payments-webhook`
- [ ] Настроена переменная `PROVIDER_WEBHOOK_SECRET`
- [ ] Зарегистрирован webhook URL у платежного провайдера
- [ ] Протестирован webhook без подписи
- [ ] Протестирован webhook с HMAC подписью
- [ ] Проверена безопасность RLS (anon key только SELECT)
- [ ] Проверен service role доступ (полный)

---

## Дополнительные ресурсы

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Версия документа:** 1.0  
**Дата создания:** 2025-01-06  
**Автор:** GitHub Copilot Agent
