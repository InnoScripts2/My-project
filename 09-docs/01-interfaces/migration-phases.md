# Фазы миграции структуры (Variant 1 — DDD)

Этот документ фиксирует безопасный порядок шагов для move-only миграции.

## Фаза A — Низкий риск (готово)

- Перенос `apps/artifacts` → `10-tools/04-infrastructure/artifacts`.
- Перенос внешних материалов `вспомогательные ресурсы/*`, `партнёрские программы/*` → `10-tools/01-interfaces/third-party/*`.
- Включение `git config core.longpaths true` (Windows).

## Фаза B — Приложения и пакеты (требует синхронизации импортов)

- Перенос `apps/kiosk-agent` → `03-apps/02-application/kiosk-agent`.
- Перенос `apps/kiosk-frontend` → `03-apps/02-application/kiosk-frontend`.
- Перенос `packages/*` → `02-domains/03-domain/*`.

Проверки после B:

- Typecheck/build агента, тесты, линт, статика.
- Сборка должна упасть на путях — фикс импортов и tsconfig `paths`/alias в следующем цикле.

## Фаза C — Инфраструктура и документация

- Перенос `infra` → `06-infra/04-infrastructure/infra-root`.
- Перенос `docs` → `09-docs/01-interfaces/docs-root`.

Примечание: задачи npm и скрипты, завязанные на пути infra/docs, нужно обновить после переноса.

## Откат (fallback)

- Любой перенос через `git mv` обратим: `git mv -k NEW OLD`.
- В экстренном случае — `git reset --hard` к коммиту до миграции в ветке.
