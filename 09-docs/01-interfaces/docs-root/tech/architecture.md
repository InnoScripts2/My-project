# Архитектура системы

Подробные правила и контекст — в `.github/instructions/instructions.instructions.md` (разделы 4, 10, 11).

## Обзор компонентов

### Фронтенд (kiosk-frontend)
- Статический HTML/CSS/JS интерфейс
- Работает в киоск-режиме браузера или Electron
- Общается с kiosk-agent по HTTP (локально) или Supabase (облачно)
- Поддерживает два режима источника данных:
  - `source=agent` (дефолт) — REST API локального агента
  - `source=supabase` — чтение публичных VIEW через Supabase anon key (read-only)

### Локальный агент (kiosk-agent)
- Node.js + TypeScript + ESM сервис
- Управляет устройствами (OBD-II, толщиномер)
- Обрабатывает платежи (DEV эмуляция, PROD — PSP)
- Генерирует и отправляет отчёты
- Хранение данных (AGENT_PERSISTENCE):
  - `memory` — InMemoryStore (для тестирования)
  - `sqlite` — локальная БД (дефолт для DEV)
  - `pg` — PostgreSQL (для локального сервера)
  - `supabase` — облачная БД через SupabaseStore (service role)

### Облачный API (apps/cloud-api)
- Node.js + TypeScript + ESM + Express сервис (опционально)
- Тонкий API шлюз для платежей/вебхуков (при необходимости)
- Использует Supabase service role key для записи данных
- REST эндпоинты:
  - `/api/sessions` — создание/получение/завершение сессий
  - `/api/thk/points` — запись точек толщинометра
  - `/api/diag/events` — запись событий диагностики
  - `/api/reports` — создание отчётов
  - `/api/payments/*` — управление платежами
  - `/api/equipment/status` — статусы оборудования

### Supabase (облачная БД + auth)
- PostgreSQL база данных с RLS политиками
- Таблицы:
  - `sessions` — сессии услуг
  - `thickness_points` — точки измерений толщинометра
  - `diagnostics_events` — события диагностики OBD-II
  - `reports` — отчёты для клиентов
  - `payments` — платежи
  - `equipment_status` — статусы оборудования
  - `vehicles`, `customers`, `diagnostics_codes` — справочники
- RLS политики:
  - Анонимный доступ (anon key): только SELECT из таблиц и VIEW
  - Service role (service key): полный доступ (минует RLS)
  - Публичные VIEW без PII: `v_reports_public`, `v_sessions_public`, `v_equipment_status_public`

## Потоки данных

### Локальный режим (source=agent)
```
┌─────────────┐
│   Frontend  │ (index.html)
│  (Киоск UI) │
└──────┬──────┘
       │ HTTP (localhost:7070)
       ↓
┌─────────────────────────────────────────┐
│        kiosk-agent (Node.js)            │
│  ┌──────────────────────────────────┐   │
│  │  REST API + WebSocket (опц.)     │   │
│  ├──────────────────────────────────┤   │
│  │  Device Drivers                  │   │
│  │  • OBD-II (ELM327)              │   │
│  │  • Толщиномер (SDK/GATT)        │   │
│  │  • Замки (GPIO/Serial)          │   │
│  ├──────────────────────────────────┤   │
│  │  Business Logic                  │   │
│  │  • Payments (PSP/Emulator)      │   │
│  │  • Reports (Email/SMS)          │   │
│  │  • Sessions                      │   │
│  │  • Prometheus Metrics           │   │
│  └──────────────────────────────────┘   │
└─────────┬───────────────────────────────┘
          │ AGENT_PERSISTENCE
          ↓
    ┌─────────┬─────────┬──────────┐
    │ Memory  │ SQLite  │PostgreSQL│ Supabase
    │(InMem)  │(Local)  │  (Local) │ (Cloud)
    └─────────┴─────────┴──────────┴────┬────
                                         │
                                         │ Service Role Key
                                         ↓
                              ┌──────────────────┐
                              │  Supabase Cloud  │
                              │  (PostgreSQL)    │
                              │  + RLS Policies  │
                              └──────────────────┘
```

### Облачный режим (source=supabase)
```
┌─────────────┐
│   Frontend  │ (index.html)
│  (Киоск UI) │ + @supabase/supabase-js
└──────┬──────┘
       │ Anon Key (read-only)
       │ HTTPS
       ↓
┌──────────────────────────────────────────┐
│          Supabase Cloud                  │
│  ┌────────────────────────────────────┐  │
│  │     PostgreSQL Database            │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │   Tables (protected by RLS)  │  │  │
│  │  │   • sessions                 │  │  │
│  │  │   • thickness_points         │  │  │
│  │  │   • diagnostics_events       │  │  │
│  │  │   • reports (with PII)       │  │  │
│  │  │   • payments                 │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │   Public VIEW (no PII)       │  │  │
│  │  │   • v_sessions_public ✓      │  │  │
│  │  │   • v_reports_public ✓       │  │  │
│  │  │   • v_equipment_status_public│  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  RLS Policies:                           │
│  • anon: SELECT на VIEW только           │
│  • service_role: полный доступ (минует)  │
└──────────────────────────────────────────┘
         ↑
         │ Service Role Key (полный доступ)
         │
    ┌────┴─────┬───────────────┐
    │          │               │
┌───┴────┐ ┌──┴──────┐  ┌─────┴──────┐
│ kiosk- │ │ cloud-  │  │   Other    │
│ agent  │ │ api     │  │  Services  │
└────────┘ └─────────┘  └────────────┘
```

### Cloud API архитектура
```
┌────────────────────────────────────────────┐
│           cloud-api (Express)              │
│  ┌──────────────────────────────────────┐  │
│  │        Middleware Stack              │  │
│  │  • helmet (security)                 │  │
│  │  • CORS (restricted origins)         │  │
│  │  • express-rate-limit (100 req/min)  │  │
│  │  • morgan (JSON logging)             │  │
│  │  • x-request-id (correlation)        │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │         REST Endpoints               │  │
│  │  • POST /api/sessions                │  │
│  │  • POST /api/thk/points              │  │
│  │  • POST /api/diag/events             │  │
│  │  • POST /api/reports                 │  │
│  │  • POST /api/payments/intent         │  │
│  │  • POST /api/equipment/status        │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │      Observability                   │  │
│  │  • GET /health (basic)               │  │
│  │  • GET /readiness (DB check)         │  │
│  │  • GET /metrics (Prometheus)         │  │
│  │    - sessions_created_total          │  │
│  │    - points_upserted_total           │  │
│  │    - http_request_duration_seconds   │  │
│  └──────────────────────────────────────┘  │
└────────────────┬───────────────────────────┘
                 │ Service Role Key
                 ↓
          ┌──────────────┐
          │   Supabase   │
          └──────────────┘
```

### Мониторинг и метрики
```
┌──────────────┐     ┌──────────────┐
│  kiosk-agent │     │  cloud-api   │
│              │     │              │
│  /metrics ───┼─────┼──> Prometheus│
│              │     │              │
│  • supabase_ │     │  • sessions_ │
│    operations│     │    created   │
│  • supabase_ │     │  • payments_ │
│    retries   │     │    confirmed │
│  • payment_  │     │  • http_req_ │
│    intents   │     │    duration  │
└──────────────┘     └──────────────┘
        │                    │
        └────────┬───────────┘
                 ↓
          ┌──────────────┐
          │  Prometheus  │
          │   (scrape)   │
          └──────┬───────┘
                 │
                 ↓
          ┌──────────────┐
          │   Grafana    │
          │ (dashboards) │
          └──────────────┘
```

## Безопасность

### Ключи доступа
- **SUPABASE_ANON_KEY**: публичный ключ для фронтенда (только чтение VIEW)
- **SUPABASE_SERVICE_ROLE_KEY**: серверный ключ для kiosk-agent/cloud-api (полный доступ)
  - ❗ НИКОГДА не передавать во фронтенд/Android
  - Используется только на серверной стороне

### RLS политики

#### Модель безопасности

Все таблицы защищены Row Level Security (RLS) с двухуровневой моделью доступа:

**Уровень 1: Анонимный доступ (anon key)**
- Используется во фронтенде для чтения данных
- Разрешены только операции SELECT
- Доступ ограничен публичными VIEW без PII
- Политики: `USING (true)` для SELECT на каждой таблице
- Все операции INSERT/UPDATE/DELETE заблокированы

**Уровень 2: Service Role (service key)**
- Используется только на серверах (kiosk-agent, cloud-api)
- Полный доступ ко всем таблицам (минует RLS)
- Все операции разрешены: SELECT, INSERT, UPDATE, DELETE
- ❗ КРИТИЧНО: никогда не передавать во фронтенд/Android

#### Таблицы и политики

| Таблица | SELECT (anon) | INSERT/UPDATE/DELETE (anon) | Service Role |
|---------|---------------|------------------------------|--------------|
| sessions | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| thickness_points | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| diagnostics_events | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| reports | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| payments | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| vehicles | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| customers | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |
| equipment_status | ✅ Разрешено | ❌ Запрещено | ✅ Минует RLS |

#### Публичные VIEW без PII

Для безопасного чтения данных фронтендом созданы VIEW, которые:
- Исключают персональные данные (email, phone, delivery_meta)
- Содержат только необходимую для UI информацию
- Доступны для SELECT через анонимный ключ

| VIEW | Исходная таблица | Исключённые поля |
|------|------------------|------------------|
| v_reports_public | reports | recipient_email, recipient_phone, delivery_meta |
| v_sessions_public | sessions | vehicle_id, customer_id, metadata |
| v_equipment_status_public | equipment_status | error_message, metadata |

#### Применение политик

Критическая миграция `20251004000000_secure_rls_policies.sql`:
1. Удаляет небезопасные политики "Публичный доступ" с правом записи
2. Создаёт политики только на SELECT для анонимных пользователей
3. Создаёт защищённые VIEW без PII
4. Настраивает GRANT для доступа к VIEW

См. подробности в `supabase/migrations/README.md`

#### Индексы производительности

Добавлены индексы для hot-путей (миграция `20251005000000_add_performance_indexes.sql`):

- **sessions:** status, kind, started_at, finished_at
- **thickness_points:** session_id, created_at, (session_id + point_index)
- **diagnostics_events:** session_id, event_type, created_at
- **payments:** status, intent_id, session_id, created_at
- **reports:** session_id, created_at, delivered
- **equipment_status:** (device_type + device_id), last_check

Эти индексы оптимизируют частые запросы:
- Получение всех точек/событий для сессии (JOIN по session_id)
- Фильтрация сессий по статусу
- Поиск недоставленных отчётов
- Поиск платежей по внешнему intent_id

## Слои приложения
- **UI** (kiosk-frontend) — интерфейс пользователя
- **Application/Service** (kiosk-agent) — оркестрация бизнес-логики
- **Domain** — модели и валидация
- **Device Drivers** (ELM327 / Thickness SDK) — взаимодействие с устройствами
- **Infra** — интеграции (Payments, Reports, Lock, Storage, Supabase)

## Окружения

### DEV
- Эмуляция платежей (confirm-dev эндпоинты)
- Кнопка "Пропустить" для навигации (без генерации фейковых данных)
- Поддержка всех режимов AGENT_PERSISTENCE
- AI функции доступны по умолчанию

### PROD
- Реальный PSP для платежей
- Кнопка "Пропустить" отключена
- AGENT_PERSISTENCE=supabase рекомендуется
- AI функции только при AI_ENABLE_IN_PROD=true

Диаграммы последовательностей и схемы устройств будут добавлены по мере имплементации драйверов.
