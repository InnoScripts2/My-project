# Реестр чувствительных ключей и токенов

> Назначение: единая точка отслеживания всех внешних ключей и токенов, связанных с инфраструктурой киоска. Реестр хранит **только метаданные** и расположение секретов. Фактические значения остаются в защищённых хранилищах.

## Общие правила
- Секреты не коммитятся в репозиторий и не копируются в артефакты сборки.
- Управление выполняется через `android/.env`, `apps/`-агенты и защищённые секреты CI (GitHub Actions, локальный Vault).
- Каждому ключу назначается владелец и политика ротации не реже одного раза в 90 дней.
- Изменения в реестре синхронизируются с `.github/copilot-instructions.md` и runbook поддержкой.

## Таблица секретов

| Система                    | Переменная окружения / Secret ID             | Расположение значения                                                 | Ответственный | Примечания                                                  |
| -------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| Supabase (основной проект) | `SUPABASE_URL`                               | CI секрет `SUPABASE_URL`, локальный `.env.kiosk`                      | DevOps        | Базовый URL проекта; не содержит токена                     |
| Supabase (основной проект) | `SUPABASE_SERVICE_ROLE_KEY`                  | GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY`; локальный Safe     | Backend Lead  | Доступ только для фоновых задач; не использовать на клиенте |
| Supabase (Edge Functions)  | `SUPABASE_ANON_KEY`                          | kiosk-agent `.env`, Windows Credential Manager                        | Backend Lead  | Минимальные права (индексирование публичных таблиц)         |
| Supabase (Storage)         | `SUPABASE_STORAGE_SIGNING_KEY`               | Vault entry `supabase/storage-signing`                                | DevOps        | Подписывает ссылки отчётов; срок действия 30 дней           |
| Green API (WhatsApp)       | `GREEN_API_INSTANCE_ID`                      | GitHub secret `GREEN_API_INSTANCE_ID`, локальный `.env.notifications` | Ops Lead      | Привязан к аккаунту автоуведомлений                         |
| Green API (WhatsApp)       | `GREEN_API_TOKEN`                            | Vault entry `green-api/token`, CI secret `GREEN_API_TOKEN`            | Ops Lead      | Токен обновляется через личный кабинет каждые 60 дней       |
| Email (SMTP провайдер)     | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`        | Vault `notifications/smtp`, локальный `.env.mail`                     | Ops Lead      | Используется генератором отчётов                            |
| SMS провайдер              | `SMS_API_KEY`, `SMS_API_SECRET`              | Vault `notifications/sms`, CI secret `SMS_API_KEY`                    | Ops Lead      | Для push-уведомлений статусов                               |
| PSP (платёжный шлюз)       | `PAYMENTS_PUBLIC_KEY`, `PAYMENTS_SECRET_KEY` | Vault `payments`, CI secret `PAYMENTS_SECRET_KEY`                     | Payments Lead | Прод-ключи отделены от dev ключей                           |
| Watchdog / Heartbeat       | `WATCHDOG_TOKEN`                             | Vault `ops/watchdog`                                                  | Ops Lead      | Для авторизации сервисных health-checks                     |

## Процесс обновления
1. Инициировать ротацию через владельца секрета.
2. Обновить значение в секретном хранилище.
3. Перегенерировать соответствующие `.env`/Credential Manager записи.
4. Выполнить smoke-тест затронутых сервисов.
5. Зафиксировать дату ротации в таблице выше (Git commit).

## Планируемые интеграции
- Интеграция API токенов для провайдера email fallback (`Mailgun`/`SendGrid`).
- Поддержка второго Supabase проекта для QA стенда (отдельные ключи `SUPABASE_QA_*`).
- Включение Webhook Secret для платежей (`PAYMENTS_WEBHOOK_SECRET`).

> Любые новые ключи добавлять в таблицу и согласовывать в ретро ближайшей сессии.
