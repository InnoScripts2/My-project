# Session 05 — Archive preparation

Дата: 03.11.2025
Диапазон: Фаза A, сессия 5 (подготовка)

## Цели
- Сформировать перечень не-Android каталогов для переноса/удаления.
- Зафиксировать зависимые артефакты (npm-скрипты, CI), которые затронет миграция.
- Подготовить пошаговый план и валидировать его на шаблоне PR.

## Выполненные действия
- Импортирован чек-лист из `PR_TEMPLATE__structure-move.md` как референс для структуры архивирования.
- Зафиксирован текущий список корневых директорий.
  - `apps/kiosk-agent/`
  - `apps/kiosk-frontend/`
  - `apps/admin/`
  - `node-legacy/`
  - `infra/`
  - `docs/`
  - `plan-*`
  - `functions/`
  - `src/`
  - `packages/`
  - `assets/`
  - `logs/`
  - `certs/`, `keys/`
- 06.11.2025: подтверждён актуальный список верхнеуровневых директорий через `Get-ChildItem -Directory`; сгруппированы кандидаты на перенос по категориям (legacy-приложения, инфраструктура, документация, ресурсы).
- 06.11.2025: подтверждён актуальный список верхнеуровневых директорий через `Get-ChildItem -Directory`; сгруппированы кандидаты на перенос по категориям (legacy-приложения, инфраструктура, документация, ресурсы).
- Сформирован скрипт `android/scripts/session-05-archive-plan.ps1`, показывающий набор `git mv` команд (dry-run по умолчанию) и поддерживающий флаг `-Execute` для фактического переноса с созданием целевых директорий.
- Составлена матрица перемещений:

  | Source                | Destination                                  | Категория         |
  | --------------------- | -------------------------------------------- | ----------------- |
  | `apps/kiosk-agent`    | `03-apps/02-application/kiosk-agent-legacy`  | legacy приложения |
  | `apps/kiosk-frontend` | `03-apps/02-application/kiosk-frontend`      | приложения        |
  | `apps/android-kiosk`  | `03-apps/02-application/android-kiosk`       | приложения        |
  | `apps/kiosk`          | `03-apps/02-application/kiosk-shell`         | приложения        |
  | `apps/admin`          | `03-apps/02-application/admin`               | приложения        |
  | `apps-unified`        | `03-apps/01-legacy/apps-unified`             | legacy приложения |
  | `packages`            | `02-domains/03-domain`                       | общие доменные    |
  | `modules`             | `04-packages/02-application/modules`         | общие доменные    |
  | `shared`              | `04-packages/03-domain/shared`               | общие доменные    |
  | `infra`               | `06-infra/04-infrastructure/infra-root`      | инфраструктура    |
  | `infra-unified`       | `06-infra/04-infrastructure/infra-unified`   | инфраструктура    |
  | `functions`           | `06-infra/02-application/functions`          | инфраструктура    |
  | `docs`                | `09-docs/01-interfaces/docs-root`            | документация      |
  | `docs-unified`        | `09-docs/02-application/docs-unified`        | документация      |
  | `plan-*.md`           | `09-docs/02-application/plans/<имя файла>`   | документация      |
  | `templates`           | `10-tools/01-interfaces/templates`           | tooling           |
  | `tools`               | `10-tools/01-interfaces/tools-root`          | tooling           |
  | `assets`              | `10-tools/02-application/assets`             | assets/tooling    |
  | `public`              | `10-tools/02-application/public`             | assets/tooling    |
  | `dist`                | `10-tools/04-infrastructure/dist-artifacts`  | артефакты         |
  | `build`               | `10-tools/04-infrastructure/build-artifacts` | артефакты         |
  | `logs`                | `07-ops/04-infrastructure/logs`              | ops               |
  | `supabase`            | `05-integrations/02-application/supabase`    | интеграции        |
  | `node-legacy`         | `10-tools/03-domain/node-legacy`             | legacy tooling    |
  | `certs`               | `08-security/03-domain/certs`                | безопасность      |
  | `keys`                | `08-security/03-domain/keys`                 | безопасность      |
- Таблица используется для валидации скрипта и уточнения отсутствующих путей (скрипт сигнализирует `Source missing`, если каталог отсутствует).

## Следующие шаги
- Выполнить dry-run перемещений в новой ветке с использованием `./android/scripts/session-05-archive-plan.ps1` и убедиться, что все источники покрыты.
- После фактического переноса обновить пути в npm-скриптах, CI и документации, затем прогнать `npm run lint` и `npm --prefix apps/kiosk-agent test`.
- Зафиксировать изменения в todo и документации по итогам реального перемещения.

## Итог
- Цели сессии выполнены: подготовлен полный список перемещений, создан скрипт dry-run/execution, определены проверки. Готово к переходу на сессию 6.
