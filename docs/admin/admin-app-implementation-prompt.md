# Промпт для ИИ-разработчика: реализация Admin Web App на GitHub Pages

Вы — ведущий фронтенд-инженер и интегратор. На основе предложений по библиотекам необходимо реализовать отдельное админ-приложение (SPA) для мониторинга и управления киосковым сервисом. Приложение разворачивается на GitHub Pages, работает с удалённым админ-сервисом (в PROD) и может подключаться к локальному агенту (в DEV). Требования: строгий TypeScript, чистый ESLint/Prettier, детальное логирование, i18n (ru первично, en опционально), отсутствие секретов в публичном коде.

## 0. Режим исполнения задания

- Генерируйте полноценный проект `apps/admin` в составе монорепозитория.

- Либо создайте отдельный репозиторий с тем же содержимым и укажите шаги импорта в текущий монорепозиторий.

- Используйте React + TypeScript + Vite. Маршрутизация — React Router с `base: '/admin/'` для GitHub Pages.

- Клиент данных — fetch-обёртка + TanStack Query. Схемы — zod. Формы — React Hook Form + zodResolver.

- UI — MUI + notistack + Tabler Icons. Таблицы — TanStack Table v8 (серверная пагинация и виртуализация). Графики — Apache ECharts (через `echarts-for-react`).

- Наблюдаемость — Sentry (ошибки) и опционально OpenTelemetry Web SDK (трассировки) при наличии OTLP эндпоинта и CORS.

- Потоковые события — EventSource (SSE). WebSocket (socket.io-client) — опционально, если доступно на сервере.

- Конфигурация рантайма — `public/config/runtime.json`, перекрывает Vite env. Никаких секретов в коде.

## 1. Структура проекта и файлы

- apps/admin/

  - index.html (с `<base href="/admin/" />`, meta, корневым `div#root`)

  - public/

    - 404.html (SPA fallback)

    - robots.txt

    - config/

      - runtime.example.json

  - src/

    - main.tsx (провайдеры: QueryClientProvider, SnackbarProvider, RouterProvider, i18n init, Sentry/OTel init)

    - app/

      - routes.tsx (маршруты: /admin/login, /admin/, /admin/sessions, /admin/sessions/:id, /admin/monitoring, /admin/settings)

      - layout/

        - AdminLayout.tsx (верхняя панель навигации, боковое меню, контейнер контента)

        - Nav.tsx (навигация, активные ссылки)

      - pages/

        - Login.tsx (форма логина)

        - Dashboard.tsx (карточки метрик, лента последних событий)

        - Sessions.tsx (таблица с фильтрами)

        - SessionDetails.tsx (вкладки Logs/Devices/Payments)

        - Monitoring.tsx (графики метрик)

        - Settings.tsx (форма конфигурации)

    - api/

      - client.ts (fetch-обёртка, ретраи, нормализация ошибок)

      - endpoints.ts (функции запросов)

      - schemas.ts (zod-схемы DTO)

      - sse.ts (подключение и реконнекты SSE)

    - store/

      - auth.ts (in-memory хранение access/refresh, механика refresh)

      - config.ts (загрузка runtime-конфига, синхронный get, асинхронный load)

    - components/

      - DataTable/DataTable.tsx (обёртка над TanStack Table)

      - Charts/LineChart.tsx (обёртка над ECharts)

      - Forms/FormField.tsx (унифицированное поле + ошибки)

      - StatusBadge.tsx

      - CopyToClipboard.tsx

      - CodeBlock.tsx

    - i18n/

      - index.ts

      - ru.json

      - en.json

    - styles/globals.css

  - package.json (скрипты: dev, build, preview, lint, typecheck)

  - tsconfig.json (strict, isolatedModules, jsx)

  - eslint.config.js (стандартный набор для React + TS)

  - .prettierrc (без декоративных правил)

  - vite.config.ts (base, plugins)

  - README.md (запуск, конфиг, деплой)

  - .github/workflows/pages.yml (деплой на GitHub Pages)

## 2. Конфигурация окружения

- `public/config/runtime.json` пример:

```json
{
  "apiBaseUrl": "https://admin-service.example.com",
  "sseUrl": "https://admin-service.example.com/events",
  "sentryDsn": "",
  "otlpEndpoint": "",
  "features": {
    "enableSSE": true,
    "enableOTel": false
  }
}
```

- В DEV — `apiBaseUrl: "http://localhost:7070"` при включённом CORS на локальном агенте.

- `src/store/config.ts` должен уметь: загрузить JSON, держать значения в памяти, предоставлять `getRuntimeConfigSync()` и `await loadRuntimeConfig()`; иметь дефолты на случай отсутствия файла.

## 3. Контракты и схемы DTO (zod)

- Session:

  - `{ id: string, startedAt: string, finishedAt?: string, service: 'OBD' | 'THICKNESS', status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled', payment?: Payment, deviceMeta?: DeviceMeta }`

- Payment:

  - `{ intentId: string, status: 'created' | 'pending' | 'succeeded' | 'failed', amount: number, currency: string }`

- DeviceMeta:

  - `{ obd?: { connected: boolean, rssi?: number, protocol?: string }, thickness?: { issued: boolean, lastReturnTs?: string } }`

- LogEvent:

  - `{ ts: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, sessionId?: string, tags?: Record<string, string> }`

- MetricPoint:

  - `{ ts: string, name: string, value: number }`

- Создайте zod-схемы в `src/api/schemas.ts` и экспортируйте типы через `z.infer`.

## 4. REST API эндпоинты (примерный контракт)

- `GET /admin/sessions?page=&size=&q=&service=&status=&from=&to=` — список сессий.

- `GET /admin/sessions/:id` — детали сессии.

- `GET /admin/sessions/:id/logs?cursor=` — логи постранично (курсор).

- `GET /admin/metrics?name=&range=` — метрики.

- `POST /admin/auth/login` — вход (email/password или token).

- `POST /admin/auth/refresh` — обновление токена.

- `POST /admin/commands/:sessionId/:action` — админ-команды (например, `refresh-payment`, `request-status`).

Примечания:

- Сервер должен разрешать CORS для домена GitHub Pages. Если cookie, то домены/флаги должны быть совместимы. Предпочтительно Bearer-токен.

- Для DEV предоставьте простой прокси или используйте прямой доступ к локальному агенту.

## 5. Клиент данных: fetch-обёртка и Query

- `src/api/client.ts`:

  - Собирает полный URL из `apiBaseUrl`.

  - Добавляет `Authorization: Bearer <accessToken>` при наличии.

  - Ставит `Content-Type: application/json` по умолчанию.

  - Ретраи на 429/5xx и сетевые ошибки (экспоненциальный бэкофф, 3–5 попыток).

  - Возвращает нормализованные ошибки `{ code?: string | number, message: string, details?: any }`.

- TanStack Query:

  - Инициализируйте `QueryClient` с глобальными опциями retry/staleTime/cacheTime.

  - Реализуйте хуки: `useSessions(params)`, `useSession(id)`, `useSessionLogs(id, params)`, `useMetrics(params)`.

  - Инвалидируйте кэш при событиях SSE и обновляйте данные «живьём».

## 6. SSE события

- `src/api/sse.ts`: создайте функцию подключения EventSource с токеном (`?token=`), обработчиками `onmessage/onerror`, бэкоффом реконнектов.

- События: `session.started`, `session.updated`, `session.finished`, `session.failed`, `log.appended`, `metric.point`.

- Обновляйте соответствующие кэши Query и UI-компоненты.

- Флаг `features.enableSSE` позволяет отключить SSE в рантайме.

## 7. Страницы и навигация

- Login:

  - Форма на React Hook Form + zodResolver, поля email/password, альтернатива — ввод только токена.

  - По успешном входе — сохранить токены в in-memory (`store/auth.ts`), инициировать загрузку профиля (если нужно), редирект на `/admin/`.

- Dashboard:

  - Карточки: «Активные сессии», «Ошибки за 15 минут», «Средняя латентность». Данные — из `/admin/metrics`.

  - Лента «последние события» — 50 последних записей из SSE или `/admin/logs?limit=50`.

- Sessions:

  - Таблица с серверной пагинацией, сортировками и фильтрами (статус, услуга, период, строковый поиск).

  - Виртуализация строк для больших наборов.

  - Действия: копирование ID, переход в детали, экспорт видимого набора в CSV.

- Session Details:

  - Шапка: ID, статус, начало/завершение, услуга.

  - Вкладка Logs: лента, фильтрация по уровню, подгрузка по курсору, копирование фрагментов.

  - Вкладка Devices: текущее состояние устройств, история подключений, RSSI, протокол OBD, кнопка «Запросить статус» (через `/admin/commands`).

  - Вкладка Payments: intents, статусы, суммы, «Обновить статус».

- Monitoring:

  - Графики ECharts: выбор метрик и интервалов (15m/1h/24h/custom). Обновление по SSE.

- Settings:

  - Просмотр/редактирование конфигурации (если доступно по API). Валидация zod, подтверждения действий.

## 8. Компоненты UI

- DataTable: обёртка с колонками, серверными запросами, виртуализацией, выделением строк.

- LineChart: обёртка над ECharts, конфигурация осей, легенды, тултипа; приём массива `MetricPoint[]`.

- FormField: универсальный компонент для RHF, отображает label, input, ошибки валидации.

- StatusBadge: визуализация статуса сессии/платежа.

- CopyToClipboard: копирование ID/токенов с уведомлениями.

- CodeBlock: отображение JSON/текстовых данных с моноширинным шрифтом.

## 9. Аутентификация и безопасность

- Храните токены в памяти (in-memory), обновляйте через `/admin/auth/refresh` по таймеру и при 401.

- Не используйте LocalStorage для секретов. Cookie httpOnly — только если домены совместимы и CORS настроен.

- Очистка состояния при logout.

- Санитизируйте пользовательский ввод (фильтры/поиск), экранируйте вывод.

## 10. Наблюдаемость фронтенда

- Инициализируйте Sentry при наличии `sentryDsn`: capture исключений, трекинг производительности, исключите чувствительные поля.

- Опционально включите OpenTelemetry Web SDK при `features.enableOTel` и `otlpEndpoint` (CORS, OTLP/HTTP). Экспорт спанов загрузки страниц и ключевых запросов API.

- Логируйте: реконнекты SSE, ошибки API, превышения времени рендеринга.

## 11. Производительность

- Динамические импорты для тяжёлых страниц (Monitoring, Settings).

- Виртуализация таблиц и лог-лент.

- Настройте `staleTime` и агрессивную дедупликацию запросов.

- Следите за размером бандла (анализ Vite, удаление неиспользуемого кода).

## 12. Доступность

- Фокус-стили, aria-атрибуты, поддержка клавиатуры.

- Текстовые альтернативы для графиков (агрегированные показатели под графиком).

- Контраст цветов достаточен.

## 13. Тестирование и качество

- Скрипты: `typecheck`, `lint`, при необходимости — unit-тесты (Vitest) для утилит.

- Smoke-тесты сценариев: логин, фильтрация в таблице, открытие деталей, SSE обновления, экспорт CSV.

- Линтер — без ошибок. Типы — без ошибок.

## 14. Деплой на GitHub Pages

- Workflow `.github/workflows/pages.yml`:

  - `actions/checkout@v4`

  - `actions/setup-node@v4`

  - Установка зависимостей, `npm run build`, upload artifact, deploy to Pages.

- `vite.config.ts` с `base: '/admin/'`.

- `public/404.html` с редиректом на `/admin/` (SPA fallback).

## 15. Документация

- `README.md` для `apps/admin`: запуск, конфигурация `runtime.json`, деплой, ограничения, версии.

- Таблица зависимостей с версиями и лицензиями.

- Инструкция по добавлению новых страниц и эндпоинтов.

## 16. Пакеты и версии (рекомендуемые на текущий момент)

- react, react-dom (последние стабильные)

- react-router-dom (v7 или актуальная стабильная)

- @tanstack/react-query (^5)

- zod (^3)

- react-hook-form (^7), @hookform/resolvers (^3)

- @mui/material, @mui/icons-material (актуальные стабильные)

- @tabler/icons-react (актуальная)

- notistack (^3)

- echarts (^5), echarts-for-react (актуальная совместимая)

- i18next, react-i18next (актуальные)

- date-fns (актуальная)

- @sentry/browser (актуальная)

- (опц.) @opentelemetry/sdk-trace-web, @opentelemetry/exporter-trace-otlp-http

- eslint, @typescript-eslint/*, prettier, typescript

## 17. Минимальные примеры кода (фрагменты)

Пример `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
});
```

Пример `src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/routes';
import './styles/globals.css';

const qc = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <SnackbarProvider maxSnack={3}>
      <RouterProvider router={router} />
    </SnackbarProvider>
  </QueryClientProvider>
);
```

Пример `src/app/routes.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';
import AdminLayout from './layout/AdminLayout';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SessionDetails from './pages/SessionDetails';
import Monitoring from './pages/Monitoring';
import Settings from './pages/Settings';
import Login from './pages/Login';

export const router = createBrowserRouter([
  { path: '/admin/login', element: <Login /> },
  {
    path: '/admin/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'sessions', element: <Sessions /> },
      { path: 'sessions/:id', element: <SessionDetails /> },
      { path: 'monitoring', element: <Monitoring /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
```

Пример `src/api/client.ts`:

```ts
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { apiBaseUrl } = getRuntimeConfigSync();
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = `${apiBaseUrl}${path}`;
  let attempt = 0; const max = 4;
  // Экспоненциальный бэкофф на 429/5xx и сетевые ошибки
  for (;;) {
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? res.json() : res.text();
      }
      if (res.status === 429 || res.status >= 500) throw new Error(`retryable:${res.status}`);
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      if (attempt++ >= max) throw e;
      await new Promise(r => setTimeout(r, 300 * 2 ** attempt));
    }
  }
}
```

Пример `src/api/sse.ts`:

```ts
export function connectEvents(onEvent: (ev: any) => void) {
  const { sseUrl } = getRuntimeConfigSync();
  const token = getAccessToken();
  const url = token ? `${sseUrl}?token=${encodeURIComponent(token)}` : sseUrl;
  let es: EventSource | null = null;
  let backoff = 1000;

  const connect = () => {
    es = new EventSource(url);
    es.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data)); } catch {}
    };
    es.onerror = () => {
      es?.close();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30000);
    };
  };

  connect();
  return () => es?.close();
}
```

## 18. Критерии приёмки

- Сборка `npm run build` успешна, `npm run typecheck` без ошибок, `npm run lint` без предупреждений.

- SPA корректно открывается по `/admin/` и внутренним ссылкам, работает 404 fallback.

- Таблица сессий поддерживает большие объёмы (виртуализация + серверная пагинация).

- SSE события доставляются и отражаются без перезагрузки.

- Конфигурация берётся из `public/config/runtime.json` без пересборки.

- Нет утечек секретов, токены не сохраняются в LocalStorage.

## 19. Пошаговый план действий

- Инициализировать проект в `apps/admin`.

- Добавить и настроить зависимости.

- Реализовать загрузку runtime-конфига и инициализацию провайдеров.

- Реализовать маршруты и страницы (макеты, навигация, компоненты).

- Подключить SSE и связать с кэшем Query.

- Подключить Sentry/OTel при наличии конфигурации.

- Добавить GitHub Actions для Pages, проверить деплой.

- Заполнить README и проверить критерии приёмки.

## 20. Правила стиля и оформления

- Без эмодзи и декоративных элементов в коде, UI и документации.

- Плотный технический текст в комментариях и README, чёткие названия переменных и функций.

- Строгий ESLint/Prettier, единый код-стайл.

- Все новые публичные функции документировать JSDoc/TSdoc.

## 21. Дополнительные указания

- Если серверные контракты уточняются — адаптируйте `endpoints.ts` и `schemas.ts`, сохраняя типобезопасность и обработку ошибок.

- Предусмотрите диагностику проблем сети (индикаторы offline/online, подсказки по CORS, коды ошибок).

- Локализация: ru по умолчанию, подготовить структуру для en.

- Производительность: избегайте лишних ре-рендеров, мемоизируйте тяжёлые компоненты.

- Включите минимальные smoke-тесты и проверку линтера/типов в CI.

