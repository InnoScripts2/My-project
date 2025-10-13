# payments-webhook (Supabase Edge Function)

Источник функции, развернутой ИИ Supabase. Запуск и типы ожидаются в окружении Deno (Supabase Edge). Для локальной проверки используйте Supabase CLI.

## Деплой (через Supabase)

1. Установите переменные окружения в проекте Supabase:

   - SUPABASE_URL (по умолчанию задан в проекте)
   - SUPABASE_SERVICE_ROLE_KEY (по умолчанию задан в проекте)
   - PROVIDER_WEBHOOK_SECRET — ваш секрет подписи провайдера

2. Разверните функцию (если нужно локально синхронизировать):

   - `supabase functions download payments-webhook`
   - или поместите этот каталог в `supabase/functions` и выполните деплой из CLI

3. URL вебхука:

   - https://\<project>.functions.supabase.co/payments-webhook

## Локальный запуск (опционально)

С помощью Deno:

- `deno run --allow-env --allow-net index.ts`

Отправка тестового запроса:

- сгенерируйте HMAC-SHA256 по сырому телу с ключом `PROVIDER_WEBHOOK_SECRET`
- отправьте заголовок `x-provider-signature`

## Примечание по типам

В редакторе TypeScript может ругаться на импорты npm: и Deno.* — это ожидаемо. На Supabase Edge всё работает штатно.
