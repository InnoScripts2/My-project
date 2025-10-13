# Admin Web App

React-based admin web application для управления киосковой системой автосервиса самообслуживания.

## Технологический стек

### Основные технологии
- React 18.3+ с TypeScript
- React Router v6 (basename: /admin/)
- Vite 5 (сборка и dev-сервер)
- Material-UI (MUI) v6 для UI компонентов
- TanStack Query v5 для управления состоянием API
- TanStack Table v8 для таблиц с виртуализацией
- Zod v3 для валидации схем
- React Hook Form v7 для форм

### Дополнительные библиотеки
- Notistack для уведомлений
- Tabler Icons для иконок
- ECharts + echarts-for-react для графиков
- i18next + react-i18next для локализации (ru/en)
- date-fns для работы с датами
- Sentry Browser SDK для мониторинга ошибок

### Dev-инструменты
- ESLint + TypeScript ESLint
- Prettier
- Vitest для тестирования

## Структура проекта

```
apps/admin/
├── public/
│   ├── config/
│   │   ├── runtime.json         # Конфигурация рантайма (DEV)
│   │   └── runtime.example.json # Пример конфигурации
│   ├── 404.html                 # SPA fallback для GitHub Pages
│   └── robots.txt
├── src/
│   ├── api/
│   │   ├── client.ts            # Fetch-обёртка с ретраями
│   │   ├── endpoints.ts         # API эндпоинты
│   │   ├── schemas.ts           # Zod-схемы DTO
│   │   └── sse.ts               # SSE подключение
│   ├── app/
│   │   ├── layout/
│   │   │   └── AdminLayout.tsx  # Главный layout
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Панель управления
│   │   │   ├── Sessions.tsx     # Список сессий
│   │   │   ├── SessionDetails.tsx # Детали сессии
│   │   │   ├── Monitoring.tsx   # Графики мониторинга
│   │   │   ├── Settings.tsx     # Настройки
│   │   │   └── Login.tsx        # Страница входа
│   │   └── routes.tsx           # Маршруты приложения
│   ├── components/
│   │   ├── StatusBadge.tsx      # Бейдж статуса
│   │   ├── CopyToClipboard.tsx  # Копирование в буфер
│   │   └── CodeBlock.tsx        # Блок кода
│   ├── i18n/
│   │   ├── index.ts             # Инициализация i18n
│   │   ├── ru.json              # Русская локализация
│   │   └── en.json              # Английская локализация
│   ├── store/
│   │   ├── config.ts            # Runtime конфигурация
│   │   └── auth.ts              # In-memory токены
│   ├── styles/
│   │   └── globals.css          # Глобальные стили
│   └── main.tsx                 # Точка входа
├── index.html
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── package.json
└── README.md
```

## Установка и запуск

### Требования
- Node.js 18+
- npm 9+

### Установка зависимостей

```bash
cd apps/admin
npm install
```

### Разработка

Запуск dev-сервера (с проксированием на http://localhost:7070):

```bash
npm run dev
```

Приложение доступно по адресу: http://localhost:5174/admin/

### Сборка

Сборка для продакшена:

```bash
npm run build
```

Собранные файлы в директории `dist/`.

### Проверка типов

```bash
npm run typecheck
```

### Линтинг

```bash
npm run lint
npm run lint:fix
```

### Тестирование

```bash
npm test
```

## Конфигурация

### Runtime конфигурация

Приложение использует `public/config/runtime.json` для конфигурации без пересборки:

```json
{
  "apiBaseUrl": "http://localhost:7070",
  "sseUrl": "http://localhost:7070/events",
  "sentryDsn": "",
  "otlpEndpoint": "",
  "features": {
    "enableSSE": true,
    "enableOTel": false
  }
}
```

Для продакшена обновите `apiBaseUrl` и `sseUrl` на реальные значения.

### Переменные окружения Vite

Используются только на этапе сборки. Runtime-конфигурация имеет приоритет.

## API контракты

### Аутентификация

- `POST /admin/auth/login` - Вход (email/password или token)
- `POST /admin/auth/refresh` - Обновление токена

### Сессии

- `GET /admin/sessions?page=&size=&q=&service=&status=&from=&to=` - Список сессий
- `GET /admin/sessions/:id` - Детали сессии
- `GET /admin/sessions/:id/logs?cursor=` - Логи сессии

### Метрики

- `GET /admin/metrics?name=&range=` - Метрики

### Команды

- `POST /admin/commands/:sessionId/:action` - Выполнение админ-команд

## Деплой на GitHub Pages

### Автоматический деплой

При пуше в ветку `main` и изменениях в `apps/admin/**` запускается GitHub Actions workflow (`.github/workflows/pages.yml`), который:

1. Устанавливает зависимости
2. Проверяет типы
3. Запускает линтер
4. Собирает проект
5. Деплоит на GitHub Pages

### Ручной деплой

Запустить workflow вручную через GitHub UI (Actions → Deploy Admin to GitHub Pages → Run workflow).

### Доступ к приложению

После деплоя приложение доступно по адресу:
```
https://<username>.github.io/<repository>/admin/
```

Например: `https://innoscripts2.github.io/my-own-service/admin/`

### Настройка GitHub Pages

В настройках репозитория (Settings → Pages):
- Source: GitHub Actions
- Branch: не требуется (используется Actions)

## Безопасность

- Токены хранятся в памяти (in-memory), не используется LocalStorage
- Bearer-токены передаются через заголовок Authorization
- Санитизация пользовательского ввода через Zod
- Sentry исключает чувствительные данные (authorization, cookie)
- Secrets не должны быть в коде или runtime.json (используйте переменные окружения GitHub Actions)

## Производительность

- Динамические импорты для страниц (React.lazy)
- Серверная пагинация и виртуализация таблиц
- TanStack Query с настройками staleTime и кэширования
- Code splitting через Vite

## Доступность

- Семантическая HTML разметка
- Aria-атрибуты для интерактивных элементов
- Поддержка навигации с клавиатуры
- Достаточный контраст цветов

## Локализация

Поддерживаются языки:
- Русский (по умолчанию)
- Английский (опционально)

Переключение языка через i18next API:
```typescript
import { useTranslation } from 'react-i18next';
const { t, i18n } = useTranslation();
i18n.changeLanguage('en');
```

## Зависимости

См. `package.json` для полного списка зависимостей.

### Основные зависимости

| Пакет | Версия | Лицензия |
|-------|--------|----------|
| react | ^18.3.1 | MIT |
| @mui/material | ^6.1.6 | MIT |
| @tanstack/react-query | ^5.59.0 | MIT |
| react-router-dom | ^6.27.0 | MIT |
| zod | ^3.23.8 | MIT |
| echarts | ^5.5.1 | Apache-2.0 |
| @sentry/browser | ^8.37.1 | MIT |

## Разработка

### Добавление новой страницы

1. Создайте компонент в `src/app/pages/`
2. Добавьте маршрут в `src/app/routes.tsx`
3. Добавьте пункт меню в `src/app/layout/AdminLayout.tsx`
4. Добавьте переводы в `src/i18n/ru.json` и `src/i18n/en.json`

### Добавление нового API эндпоинта

1. Определите Zod-схему в `src/api/schemas.ts`
2. Добавьте функцию в `src/api/endpoints.ts`
3. Используйте через TanStack Query hooks

### Стиль кода

- Без эмодзи и декоративных элементов
- Плотный технический текст в комментариях
- Строгий TypeScript (strict mode)
- Единый код-стайл через ESLint/Prettier

## Ограничения

- Токены не персистентны (при перезагрузке страницы требуется повторный вход)
- SSE требует CORS на сервере
- OpenTelemetry требует OTLP/HTTP эндпоинт с CORS

## Поддержка

Проект разрабатывается исключительно ИИ (GitHub Copilot) по поручениям владельца.

Для внутреннего использования. Не для публичного распространения.
