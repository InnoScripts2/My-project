# GitHub Copilot — рабочие инструкции

Этот файл служит кратким «чек-листом» для ИИ-агента, который вносит изменения в проект «Автосервис самообслуживания». Следуйте этим принципам прежде чем редактировать код.

## 0. Правила форматирования документации и кода

КРИТИЧНО: Соблюдайте единый стиль во всех текстах, отчётах, документации, комментариях кода, commit сообщениях.

Запрещено:

- Смайлики и эмодзи в любых текстах (документация, комментарии, логи, отчёты)
- Избыточное использование символов markdown emphasis (избегайте множественных звёздочек)
- Декоративные элементы в технических текстах

Стиль письма:

- Плотный технический текст без «воды»
- Конкретика: имена файлов, функций, переменных в обратных кавычках
- Структурированность: списки, таблицы, блоки кода
- Минимализм: только необходимая информация

Примеры правильного форматирования:

ПРАВИЛЬНО:

```typescript
// Создать сессию и сохранить в БД
async function createSession(data: SessionData): Promise<Session> {
  const session = await db.sessions.create(data);
  return session;
}
```

НЕПРАВИЛЬНО:

```typescript
// Создать сессию и сохранить в БД 🎉
async function createSession(data: SessionData): Promise<Session> {
  // Супер функция для создания сессий!!!
  const session = await db.sessions.create(data);
  return session;
}
```

ПРАВИЛЬНО (commit message):

```
feat(reports): add SendGrid email delivery

- Implement sendEmail function with attachment support
- Add retry mechanism for failed deliveries
- Update send-report Edge Function
```

НЕПРАВИЛЬНО (commit message):

```
✨ feat(reports): add SendGrid email delivery 🚀

- Implement sendEmail function with attachment support ⚡
- Add retry mechanism for failed deliveries 🔄
- Update send-report Edge Function 📧
```

ПРАВИЛЬНО (документация):

```markdown
## Интеграция SendGrid

Для отправки email отчётов используется SendGrid API v3.

Требуемые переменные окружения:

- SENDGRID_API_KEY
- SENDGRID_FROM_EMAIL

Пример использования:
```

НЕПРАВИЛЬНО (документация):

```markdown
## 📧 Интеграция SendGrid 🚀

Для отправки email отчётов используется **SendGrid API v3**. ✨

Требуемые переменные окружения:

- **SENDGRID_API_KEY** 🔑
- **SENDGRID_FROM_EMAIL** 📬

Пример использования: 👇
```

Применяйте эти правила ко всем создаваемым файлам: markdown документация, TypeScript/JavaScript комментарии, JSON конфигурация, SQL комментарии, Git commit сообщения, PR описания.

## 1. Архитектура и ключевые директории

- `apps/kiosk-agent/` — локальный Node.js-сервис (TypeScript, ESM). Предоставляет HTTP API для UI, управляет устройствами, платежами, логированием самопроверок и метриками.
- `apps/kiosk-frontend/` — статический kiosk UI (HTML/CSS/vanilla JS). Работает в киоск-режиме браузера или Electron-оболочке, общается с агентом по HTTP.
- `packages/` — переиспользуемые модули (например, `@selfservice/payments`). Расширяем по мере появления общих частей.
- `infra/` — скрипты для запуска в DEV (`infra/scripts/dev-run.ps1`, `dev-static.cjs`) и сервисные утилиты.
- `docs/` — продуктовые, технические и юридические материалы. Обновляйте, когда меняется UX/поведение.

Всегда сверяйтесь с `.github/instructions/instructions.instructions.md`: он содержит обязательные правила продукта и разработки.

## 2. Запуск и проверки

В корне используется общий `package.json` с вспомогательными скриптами.

| Цель                                 | Команда                                         |
| ------------------------------------ | ----------------------------------------------- |
| Запуск DEV-киоска (агент + фронтенд) | `npm run dev` (PowerShell скрипт orchestration) |
| Только агент в DEV                   | `npm --prefix apps/kiosk-agent run dev`         |
| Статическая раздача фронтенда        | `npm run static`                                |
| Сборка агента                        | `npm --prefix apps/kiosk-agent run build`       |
| Тесты агента                         | `npm --prefix apps/kiosk-agent test`            |
| Линтеры                              | `npm run lint` (ESLint + HTMLHint)              |

После изменений в `apps/kiosk-agent` или пакетах — обязательно гоняйте `npm --prefix apps/kiosk-agent test`. После правок фронтенда — минимум запустите `npm run lint:html`.

## 3. Особенности DEV/PROD

- `apps/kiosk-agent` читает `process.env.AGENT_ENV` (`DEV` по умолчанию). Не добавляйте симуляции устройств в прод.
- Фронтенд поддерживает dev-флаг через URL `?dev=1` (включает кнопку «Пропустить»). Никогда не делайте её доступной без флага.
- Оплата сейчас эмулируется в DEV (кнопки `Подтвердить оплату (DEV)`). В будущем подключим реальный PSP — оставляйте явную маркировку dev-функционала.

## 4. Работа с OBD-II и устройствами

- Центральная точка — `apps/kiosk-agent/src/devices/obd/ObdConnectionManager.ts`. Любая логика подключения/повторного подключения должна идти через него.
- Валидация payload-ов производится в `parseObdConnectPayload` (`connectOptions.ts`). Не обходите её при добавлении новых эндпойнтов.
- Самопроверка адаптера (`runObdSelfCheck`) логируется через `SelfCheckLogger`. При расширении формата синхронизируйте UI, API и логи.
- Никаких генераторов «псевдо-DTC». Если устройства нет, API должны возвращать прозрачный статус (`obd_not_connected`, пустые данные и т. п.).

## 5. Фронтенд-UX правила

- Экраны находятся в одном `index.html`. Логика навигации — модуль `script` внизу файла. Поддерживайте принцип: минимум действий клиента, крупные CTA, ясные статусы.
- Статусы устройств/самопроверок подгружаются через `/api/obd/*`. Любые новые данные выводите через существующие контейнеры (`data-obd-connection-meta`, `badge`, и т. д.) в доступном формате.
- Не добавляйте фиктивных измерений/результатов. В DEV используйте существующий «Пропустить».
- Поддерживайте единый стиль из `styles.css`. Новые компоненты — через BEM-подобные модификаторы (`.obd-connection-meta`, `.self-check-box`).

## 6. Платежи и мониторинг

- Платёжный модуль — `apps/kiosk-agent/src/payments/module.ts`. Сейчас он содержит эмулятор. При расширении сохраняйте интерфейсы `createIntent`, `getStatus`, `getIntent`.
- Метрики Prometheus регистрируются через `createPaymentsPrometheusCollector` (`/metrics` пока не опубликован). Не ломайте регистрацию/registry.
- Мониторинговые алерты описаны в `apps/kiosk-agent/src/monitoring/alerts.ts`. При изменениях обновляйте/дополняйте тесты.

## 7. Тесты и качество

- Юнит-тесты агента (Node Test Runner) лежат рядом с кодом (`*.test.ts`). При добавлении бизнес-логики — пишите тесты.
- Проверяйте ошибки линтера (`eslint --max-warnings=0`). Проект использует TypeScript strictness из `tsconfig.json` агента — не отключайте без крайней причины.
- Перед коммитом: `npm run lint` + `npm --prefix apps/kiosk-agent test`. Если трогали фронтенд — дополнительно прогоните HTMLHint.

## 8. Вклады и документация

- Любые изменения потоков/UX — отражайте в `docs/product/` или соответствующем разделе.
- Если добавляете новый модуль/пакет, обновите описание в этом файле и при необходимости в `.github/instructions/instructions.instructions.md`.
- Keep commit messages и PR-описания на русском (следуя терминологии документа).

Следуйте этим правилам и всегда проверяйте, что изменения соответствуют целям киоска самообслуживания и не нарушают ограничения по устройствам/оплате.
