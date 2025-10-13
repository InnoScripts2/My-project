# PR: Миграция структуры (Variant 1 — DDD)

Этот PR переносит каталоги без изменения содержимого файлов (move-only), согласно `09-docs/01-interfaces/structure-migration.md`.

## Что сделано

- [ ] apps/kiosk-agent → 03-apps/02-application/kiosk-agent
- [ ] apps/kiosk-frontend → 03-apps/02-application/kiosk-frontend
- [ ] packages/\* → 02-domains/03-domain/\*
- [ ] infra → 06-infra/04-infrastructure/infra-root
- [ ] docs → 09-docs/01-interfaces/docs-root
- [x] apps/artifacts → 10-tools/04-infrastructure/artifacts
- [x] вспомогательные ресурсы/\* → 10-tools/01-interfaces/third-party/\*
- [x] партнёрские программы/\* → 10-tools/01-interfaces/third-party/\*

## Проверки (после мержа)

- [ ] npm --prefix apps/kiosk-agent run build
- [ ] npm --prefix apps/kiosk-agent test
- [ ] npm run lint
- [ ] npm run static

## Риски/заметки

- Включен `git config core.longpaths true` для Windows.
- Бинарные файлы (APK > 50 MB) — рассмотреть Git LFS или вынос из репозитория.

