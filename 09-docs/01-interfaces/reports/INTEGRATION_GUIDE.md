# Руководство по интеграции с Lovable Cloud

## 📊 Подключение к базе данных

### Параметры подключения

```
URL базы данных: https://bzlkzulejwzoqdnmudmm.supabase.co
Project ID: bzlkzulejwzoqdnmudmm
API Key (anon/public): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag
```

### Структура базы данных

#### Таблица: `ai_conversations`
Хранит разговоры с ИИ
```sql
- id: UUID (primary key)
- user_id: UUID (ссылка на auth.users)
- title: TEXT (название разговора)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

#### Таблица: `ai_messages`
Хранит сообщения в разговорах
```sql
- id: UUID (primary key)
- conversation_id: UUID (ссылка на ai_conversations)
- role: TEXT ('user', 'assistant', 'system')
- content: TEXT (текст сообщения)
- created_at: TIMESTAMPTZ
```

#### Таблица: `user_data`
Хранит произвольные данные пользователей
```sql
- id: UUID (primary key)
- user_id: UUID (ссылка на auth.users)
- data_key: TEXT (ключ данных)
- data_value: JSONB (значение в JSON формате)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

## 🔐 Примеры подключения

### Node.js / TypeScript
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bzlkzulejwzoqdnmudmm.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag'

const supabase = createClient(supabaseUrl, supabaseKey)

// Пример: Получить все разговоры
const { data, error } = await supabase
  .from('ai_conversations')
  .select('*')
```

### Python
```python
from supabase import create_client, Client

url: str = "https://bzlkzulejwzoqdnmudmm.supabase.co"
key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag"

supabase: Client = create_client(url, key)

# Пример: Получить все сообщения
response = supabase.table('ai_messages').select("*").execute()
```

### cURL (прямой REST API)
```bash
curl 'https://bzlkzulejwzoqdnmudmm.supabase.co/rest/v1/ai_conversations' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag"
```

## 🤖 Доступ к ИИ через Edge Function

### Endpoint
```
POST https://bzlkzulejwzoqdnmudmm.supabase.co/functions/v1/ai-chat
```

### Пример запроса (Node.js/TypeScript)
```typescript
const response = await fetch(
  'https://bzlkzulejwzoqdnmudmm.supabase.co/functions/v1/ai-chat',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'Привет!' }
      ]
    })
  }
)

// Для streaming ответа
const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  const chunk = decoder.decode(value)
  console.log(chunk)
}
```

### Пример запроса (Python)
```python
import requests
import json

url = "https://bzlkzulejwzoqdnmudmm.supabase.co/functions/v1/ai-chat"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {key}"
}
data = {
    "messages": [
        {"role": "user", "content": "Привет!"}
    ]
}

response = requests.post(url, headers=headers, json=data, stream=True)

for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))
```

### Пример запроса (cURL)
```bash
curl -X POST 'https://bzlkzulejwzoqdnmudmm.supabase.co/functions/v1/ai-chat' \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bGt6dWxland6b3Fkbm11ZG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODA5NDUsImV4cCI6MjA3NDk1Njk0NX0.7eb-FTeYfCxU_FomJG2vbkMeSZdiYPZVb-yeydDZ5Ag" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Привет!"}
    ]
  }'
```

## 📝 Модели ИИ

Доступные модели (бесплатно до 6 октября 2025):
- `google/gemini-2.5-flash` - Рекомендуется (по умолчанию)
- `google/gemini-2.5-pro` - Мощная модель
- `google/gemini-2.5-flash-lite` - Быстрая и дешёвая

Платные модели:
- `openai/gpt-5`
- `openai/gpt-5-mini`
- `openai/gpt-5-nano`

## 🔒 Безопасность

### Row Level Security (RLS)
Все таблицы защищены политиками RLS:
- Пользователи видят только свои данные
- Требуется аутентификация для доступа к данным

### Аутентификация
Для работы с защищёнными данными используйте Supabase Auth:

```typescript
// Регистрация
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

// Вход
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Получить текущего пользователя
const { data: { user } } = await supabase.auth.getUser()
```

## 📚 Документация

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Python Client](https://supabase.com/docs/reference/python/introduction)
- [Supabase REST API](https://supabase.com/docs/guides/api)
- [Edge Functions](https://supabase.com/docs/guides/functions)

## ⚠️ Важно

1. **API ключ** - это публичный ключ (anon key), безопасен для использования в клиентских приложениях
2. **RLS политики** защищают данные на уровне базы данных
3. **Edge Function** автоматически развёрнута и готова к использованию
4. **Модели Gemini бесплатны до 6 октября 2025**

## 💡 Примеры использования

### Сохранить разговор с ИИ
```typescript
// 1. Создать разговор
const { data: conversation } = await supabase
  .from('ai_conversations')
  .insert({ user_id: user.id, title: 'Новый чат' })
  .select()
  .single()

// 2. Сохранить сообщение пользователя
await supabase
  .from('ai_messages')
  .insert({
    conversation_id: conversation.id,
    role: 'user',
    content: 'Привет!'
  })

// 3. Получить ответ от ИИ
const aiResponse = await fetch(
  'https://bzlkzulejwzoqdnmudmm.supabase.co/functions/v1/ai-chat',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Привет!' }]
    })
  }
)

// 4. Сохранить ответ ИИ
await supabase
  .from('ai_messages')
  .insert({
    conversation_id: conversation.id,
    role: 'assistant',
    content: aiResponseText
  })
```

### Сохранить пользовательские данные
```typescript
await supabase
  .from('user_data')
  .upsert({
    user_id: user.id,
    data_key: 'preferences',
    data_value: { theme: 'dark', language: 'ru' }
  })
```
