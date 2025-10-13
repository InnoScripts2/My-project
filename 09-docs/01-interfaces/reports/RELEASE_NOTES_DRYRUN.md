# Release Notes (Dry Run) — версия 0.1.0

## Обзор

Это первый предрелизный (dry run) выпуск системы "Автосервис самообслуживания". В данную версию включены все ключевые компоненты для работы киоска, **за исключением реальных интеграций с PSP (платёжным провайдером) и Email/SMS сервисами**. Эти интеграции будут добавлены в следующем релизе.

**Статус:** ✅ Готов к внутреннему тестированию и пилотному развёртыванию
**Дата:** 2025-01-05
**Версия:** 0.1.0-prerelease

---

## ✅ Что включено в этот релиз

### 1. База данных и безопасность (Supabase)

- ✅ **RLS (Row Level Security) политики:** Анонимные пользователи имеют только SELECT доступ через публичные VIEW. Запись доступна только через service role key на серверах.
- ✅ **Публичные VIEW без PII:** `v_reports_public`, `v_sessions_public`, `v_equipment_status_public` — не содержат email, phone, customer_id.
- ✅ **Индексы производительности:** Оптимизированы запросы для sessions, thickness_points, diagnostics_events, payments, reports.
- ✅ **Документация безопасности:** SQL-запросы для верификации RLS, процедура ежемесячного аудита.
- ✅ **Миграции:** Все изменения схемы применяются через миграции Supabase (`supabase/migrations/`).

### 2. Cloud API (apps/cloud-api)

- ✅ **Production-ready сервис:** Node.js + TypeScript + Express
- ✅ **Безопасность:**
  - Helmet для HTTP headers
  - CORS ограничен конкретными origins (ENV: `CLOUD_API_ALLOWED_ORIGINS`)
  - Rate limiting (100 req/min по умолчанию, настраивается)
  - Service role key только на сервере
- ✅ **Валидация:** Все входные данные проверяются через Zod схемы
- ✅ **Единый формат ошибок:** Стандартизированные ответы об ошибках с кодами, маскирование внутренних деталей в PROD
- ✅ **Observability:**
  - `/health` — базовая проверка живости
  - `/readiness` — проверка Supabase соединения
  - `/metrics` — Prometheus метрики (HTTP latency, business operations)
- ✅ **Docker:** Dockerfile с non-root user и healthcheck
- ✅ **Тесты:** 22 теста (smoke tests, validation, error handling)

**Endpoints:**
- `POST /api/sessions` — создание сессии
- `GET /api/sessions/:id` — получение данных сессии
- `POST /api/sessions/:id/finish` — завершение сессии
- `POST /api/thk/points` — запись точек толщинометра
- `POST /api/diag/events` — запись событий диагностики
- `POST /api/reports` — создание отчёта
- `POST /api/payments/intent` — создание платёжного намерения
- `GET /api/payments/:id/status` — статус платежа
- `POST /api/payments/:id/confirm-dev` (DEV only) — подтверждение платежа в DEV
- `POST /api/equipment/status` — обновление статуса оборудования

### 3. Kiosk Agent (apps/kiosk-agent)

- ✅ **Локальный сервис:** Node.js + TypeScript, управляет устройствами и бизнес-логикой
- ✅ **Persistence modes:**
  - `memory` — InMemoryStore (для тестирования)
  - `sqlite` — локальная БД
  - `pg` — PostgreSQL
  - `supabase` — облачная БД через SupabaseStore
- ✅ **SupabaseStore с ретраями:**
  - Экспоненциальный backoff (настраивается через ENV)
  - Таймауты операций (10s по умолчанию)
  - Prometheus метрики: `supabase_operations_total`, `supabase_operation_duration_seconds`, `supabase_retries_total`
- ✅ **OBD-II диагностика:**
  - Подключение через ObdConnectionManager
  - Самопроверка адаптера (SelfCheckLogger)
  - Чтение DTC (кодов неисправностей)
  - Clear DTC с подтверждением и логированием
  - Валидация payload через `parseObdConnectPayload`
- ✅ **Толщинометр:**
  - Шаблоны точек измерений (40-60 точек)
  - Синхронизация с SupabaseStore
  - DEV-метод `mark-point` доступен только в DEV режиме
- ✅ **Платежи:**
  - Эмуляция в DEV (кнопка "Подтвердить оплату (DEV)")
  - Интерфейсы готовы для интеграции реального PSP
  - TODO заглушка для следующего шага
- ✅ **Отчёты:**
  - Локальная генерация HTML
  - Сохранение в `reports/outbox/`
  - Эндпоинты для создания отчётов
  - TODO заглушки для Email/SMS провайдеров
- ✅ **Health checks:**
  - `/health/integrations` — проверка Supabase и Edge Functions
  - `/health/persistence` — проверка persistence store
- ✅ **Prometheus метрики:**
  - Payments, Supabase operations, Device status
  - `/metrics` endpoint

### 4. Frontend (apps/kiosk-frontend)

- ✅ **Статический HTML/CSS/JS интерфейс**
- ✅ **Поддержка двух режимов источника данных:**
  - `source=agent` (по умолчанию) — локальный kiosk-agent
  - `source=supabase` (read-only) — прямое чтение из Supabase через anon key
- ✅ **Настройки через UI:**
  - Модальное окно настроек (⚙️ или Ctrl+Shift+S)
  - Ввод Supabase URL и Anon Key
  - Сохранение в localStorage
- ✅ **В режиме Supabase:**
  - Девайсные CTA (устройства) выключены
  - Доступны только данные для чтения
- ✅ **Автосброс сессии по таймауту бездействия** (настраивается)
- ✅ **Доступность (частично):**
  - Aria-метки на ключевых элементах
  - Контрастные цвета
  - TODO: фокус-ловушки в модалках
- ✅ **Линт HTML:** HTMLHint проходит без ошибок

**Экраны:**
- Ожидание (attract screen)
- Приветствие + согласие с условиями
- Выбор услуги (Толщинометр / Диагностика OBD-II)
- Ветка Толщинометр: выбор типа авто, оплата, измерения, отчёт
- Ветка Диагностика: выбор авто, сканирование, paywall, сброс ошибок, отчёт

### 5. Android WebView Оболочка (apps/android-kiosk)

- ✅ **MainActivity.kt:**
  - Диалог настройки Base URL (длинное нажатие на логотип)
  - Обработчики ошибок WebView (не чёрный экран)
  - Иммерсивный режим, блокировка поворота
- ✅ **Network Security Config:**
  - DEV: разрешён cleartext (HTTP)
  - PROD: только HTTPS
- ✅ **Иконка, тема, manifest**
- ✅ **Документация:** как сменить сервер на устройстве

### 6. Edge Functions (Supabase)

- ✅ **ai-chat function:**
  - Валидация входных данных
  - Лимиты запросов на IP (базовая защита)
  - Таймаут внешнего запроса к Gemini API
  - CORS настроен через ENV
  - Унифицированные ответы об ошибках

### 7. CI/CD

- ✅ **GitHub Actions workflow:**
  - Линтинг (ESLint + HTMLHint)
  - Typecheck strict для cloud-api
  - Тесты (cloud-api, kiosk-agent)
  - Docker build для cloud-api
  - Security scan (npm audit, TruffleHog)
- ✅ **Проверка секретов:** TruffleHog в pipeline
- ✅ **Все тесты проходят:** ✅

### 8. Документация

- ✅ **README.md:** Общий обзор проекта
- ✅ **docs/tech/architecture.md:** Диаграммы архитектуры, RLS-модель, потоки данных
- ✅ **docs/product/flows.md:** Пользовательские сценарии и тексты экранов
- ✅ **docs/internal/runbooks/kiosk-ops.md:** Операционный runbook для операторов
- ✅ **supabase/migrations/README.md:** Документация миграций и проверок безопасности
- ✅ **apps/cloud-api/README.md, DEPLOYMENT.md:** Инструкции по развёртыванию
- ✅ **apps/cloud-api/Dockerfile:** Production-ready Docker image

---

## ❌ Что НЕ включено (отложено на следующий релиз)

### 1. Реальный PSP (Payment Service Provider)

**Текущее состояние:**
- В DEV используется эмуляция платежей (кнопка "Подтвердить оплату (DEV)")
- В PROD QR-коды не генерируются, платежи не обрабатываются

**Заглушки готовы для интеграции:**
- `apps/kiosk-agent/src/payments/module.ts` — интерфейсы `createIntent`, `getStatus`, `confirm`
- TODO комментарии с пометкой "PSP integration: follow-up"

**Следующий шаг:**
- Интеграция с ЮKassa / Сбербанк / Tinkoff / другой PSP
- Обработка вебхуков
- Генерация реальных QR-кодов

### 2. Email / SMS провайдеры

**Текущее состояние:**
- Отчёты сохраняются локально в `reports/outbox/`
- В DEV симулируется отправка (лог в консоль)
- В PROD реальная отправка не работает

**Заглушки готовы для интеграции:**
- `apps/kiosk-agent/src/reports/mailer.ts` — интерфейс `sendReportEmail`
- `apps/kiosk-agent/src/reports/sms.ts` — интерфейс `sendSms`
- TODO комментарии с пометкой "Email/SMS provider: follow-up"

**Следующий шаг:**
- Интеграция с SendGrid / Mailgun / другой email provider
- Интеграция с SMS.ru / Twilio / другой SMS provider
- Обработка ошибок доставки и ретраи

### 3. PowerShell таски для локального запуска (улучшения)

**Текущее состояние:**
- `infra/scripts/dev-run.ps1` — базовый скрипт для запуска в DEV
- `infra/scripts/dev-static.cjs` — статическая раздача фронтенда

**Что можно улучшить:**
- Автоматическая проверка зависимостей (Node.js, npm, ports)
- Параллельный запуск всех компонентов в одном окне
- Таски для запуска cloud-api локально
- Интеграция с VS Code tasks

### 4. Полная доступность (Accessibility)

**Текущее состояние:**
- Aria-метки на ключевых элементах ✅
- Контрастные цвета ✅
- Фокус-ловушки в модалках ❌ (частично)
- Навигация с клавиатуры ❌ (частично)

**Следующий шаг:**
- Полный аудит доступности (WCAG 2.1 AA)
- Тесты с screen readers
- Улучшение навигации клавиатурой

---

## 🚀 Как развернуть (Quick Start)

### Локальная разработка (Windows)

1. **Установите зависимости:**
   ```powershell
   npm install
   cd apps/cloud-api && npm install
   cd ../kiosk-agent && npm install
   ```

2. **Настройте .env файлы:**
   ```bash
   # apps/kiosk-agent/.env
   AGENT_ENV=DEV
   AGENT_PERSISTENCE=supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # apps/cloud-api/.env
   NODE_ENV=development
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Примените миграции Supabase:**
   ```bash
   cd supabase
   supabase link --project-ref your-project-id
   supabase db push
   ```

4. **Запустите компоненты:**
   ```powershell
   # Terminal 1: kiosk-agent
   npm --prefix apps/kiosk-agent run dev

   # Terminal 2: frontend
   npm run static

   # Terminal 3 (опционально): cloud-api
   npm --prefix apps/cloud-api run dev
   ```

5. **Откройте в браузере:**
   - Frontend: `http://localhost:8080`
   - Agent: `http://localhost:7070`
   - Cloud API: `http://localhost:7071`

### Production (Docker)

```bash
# Cloud API
cd apps/cloud-api
docker build -t kiosk-cloud-api:0.1.0 .
docker run -d \
  -p 7071:7071 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e NODE_ENV=production \
  --name kiosk-cloud-api \
  kiosk-cloud-api:0.1.0
```

---

## 📊 Метрики качества

### Тесты
- **Cloud API:** 22/22 ✅
- **Kiosk Agent:** 15/15 ✅ (без реальных устройств)
- **Frontend:** HTMLHint 0 ошибок ✅

### Линтинг
- **ESLint:** 0 warnings ✅
- **TypeScript strict:** 0 errors ✅
- **HTMLHint:** 0 errors ✅

### Security
- **npm audit:** Нет критичных уязвимостей ✅
- **TruffleHog:** Нет утечек секретов ✅
- **RLS policies:** Проверены ✅

### Performance (базовые показатели)
- **Supabase latency:** < 200ms (оптимально)
- **HTTP request duration:** < 100ms (локально)
- **Cloud API response time:** < 500ms (без БД)

---

## 🔧 Известные ограничения

1. **Платежи:** Только эмуляция в DEV. В PROD не работает.
2. **Отчёты:** Не отправляются по email/SMS. Сохраняются локально.
3. **Устройства:** Требуют реального оборудования (OBD адаптер, толщиномер).
4. **Android:** Базовая WebView оболочка, без push notifications.
5. **Доступность:** Частично реализована, требует полного аудита.

---

## 📝 Что дальше?

### Релиз 0.2.0 (Планируется)

- ✅ Интеграция реального PSP (ЮKassa / Сбербанк)
- ✅ Интеграция Email/SMS провайдеров
- ✅ Полная доступность (WCAG 2.1 AA)
- ✅ Улучшенные PowerShell таски
- ✅ Мониторинг и алертинг (Grafana + AlertManager)
- ✅ E2E тесты для критичных потоков
- ✅ Локализация (мультиязычность)

### Долгосрочные планы

- Поддержка других марок автомобилей (не только Toyota/Lexus)
- Расширенная диагностика (PID-мониторинг в реальном времени)
- Интеграция с CRM/ERP системами
- Мобильное приложение для клиентов (история отчётов)
- AI-ассистент для расшифровки DTC кодов (уже есть базово)

---

## 💬 Обратная связь

Если вы обнаружили баг или у вас есть предложения по улучшению:
- [Создайте Issue](https://github.com/InnoScripts2/my-own-service/issues/new)
- Email: support@example.com
- Slack: #kiosk-feedback (внутренний канал)

---

**Спасибо за использование системы "Автосервис самообслуживания"!**

*Команда разработки*
