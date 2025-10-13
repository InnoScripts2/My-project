# Quality Gates — Критерии качества проекта

## Обзор

Этот документ определяет минимальные критерии качества (Quality Gates), которые должны быть выполнены перед каждым коммитом и релизом.

## Обязательные проверки перед коммитом

### 1. Линтинг

```bash
npm run lint
```

**Критерий:** 0 ошибок, 0 предупреждений

- ESLint: проверка TypeScript кода в `kiosk-agent` и доменных модулях
- HTMLHint: проверка HTML разметки в `kiosk-frontend`

### 2. Типизация (TypeScript Strict Mode)

```bash
npm run typecheck:strict
```

**Критерий:** 0 ошибок типизации

Проверяет:
- `kiosk-agent` с включенным strict mode
- `cloud-api` с включенным strict mode

### 3. Тесты

```bash
npm test
```

**Критерий:** Все тесты проходят успешно

Запускает юнит-тесты в `kiosk-agent`:
- Тесты платёжного модуля
- Тесты OBD драйвера
- Тесты хранилища
- Тесты логирования
- Тесты самопроверок

Для полного прогона (включая cloud-api):
```bash
npm run test:all
```

### 4. Безопасность

```bash
npm run security:validate
```

**Критерий:** Нет критических проблем

Проверяет:
- Отсутствие .env файлов в репозитории
- Наличие .env.example с документированными переменными
- Отсутствие секретов в коде
- Корректность документации по безопасности

## Проверки перед релизом

### 1. Все обязательные проверки (выше)

Все Quality Gates должны быть пройдены.

### 2. Сборка приложений

```bash
# Сборка kiosk-agent
npm --prefix 03-apps/02-application/kiosk-agent run build

# Сборка cloud-api
npm run cloud-api:build
```

**Критерий:** Сборка успешна, нет ошибок

### 3. Smoke-тесты (опционально)

При наличии устройств в DEV окружении:

```bash
# Все smoke-тесты
npm --prefix 03-apps/02-application/kiosk-agent run smoke:all

# Или отдельные
npm --prefix 03-apps/02-application/kiosk-agent run smoke:obd
npm --prefix 03-apps/02-application/kiosk-agent run smoke:thickness
npm --prefix 03-apps/02-application/kiosk-agent run smoke:payments
```

### 4. Проверка зависимостей

```bash
npm audit
npm run report:dependencies
```

**Критерий:** Нет критических уязвимостей

### 5. Android APK (если требуется)

```bash
npm run apk:doctor        # Проверка окружения
npm run apk:build         # Debug сборка
npm run apk:verify        # Проверка манифеста
```

## CI/CD проверки

GitHub Actions автоматически запускает:

1. **Lint & Typecheck** (на каждый push)
2. **Tests** (на каждый PR)
3. **Security Scan** (на каждый PR)
4. **Build** (на main ветке)

См. `.github/workflows/` для деталей.

## Локальная проверка перед push

Рекомендуемая последовательность:

```bash
# 1. Линтинг
npm run lint

# 2. Типизация
npm run typecheck:strict

# 3. Тесты
npm test

# 4. Безопасность (опционально)
npm run security:validate

# Если всё ОК — можно коммитить
```

## Исключения

### Dev-режим

В DEV окружении допустимы:
- Кнопка "Пропустить" для навигации по экранам (НЕ доступна в prod)
- Имитация платежей (НЕ доступна в prod)
- Логирование с повышенной детализацией

### Недоступное оборудование

При отсутствии физических устройств:
- Smoke-тесты можно пропустить
- Юнит-тесты должны проходить с моками/заглушками

## Исправление проблем

### ESLint ошибки

```bash
# Автофикс (где возможно)
npx eslint --fix "03-apps/02-application/kiosk-agent/src/**/*.{ts,tsx,js}"
```

### TypeScript ошибки

Проверьте `tsconfig.json` в соответствующем приложении. Не отключайте strict mode без крайней необходимости.

### Тесты падают

1. Проверьте логи теста
2. Убедитесь, что зависимости установлены (`npm install`)
3. Проверьте переменные окружения (`.env.example`)
4. Запустите тест изолированно:
   ```bash
   node --loader ts-node/esm --test src/path/to/test.test.ts
   ```

## Метрики качества

Целевые показатели:
- **Test Coverage:** >70% для критических модулей
- **Lint Warnings:** 0
- **Type Errors:** 0
- **Security Issues:** 0 critical, 0 high

## Связанные документы

- [.github/instructions/instructions.instructions.md](../../../../.github/instructions/instructions.instructions.md) — Главные инструкции проекта
- [.github/copilot-instructions.md](../../../../.github/copilot-instructions.md) — Рабочие инструкции
- [OPERATIONS_GUIDE.md](./runbooks/OPERATIONS_GUIDE.md) — Операционное руководство
- [08-security/README.md](../../../../08-security/README.md) — Документация по безопасности
