# Процедура импорта backlog задач (безопасность и Stage 1)

Документ описывает шаги для загрузки подготовленных списков задач из `outbox/security-backlog-tasks.json` и `outbox/stage1-pass-thru-backlog.json` (или соответствующих CSV) в систему трекинга.

## 1. Подготовка файлов

1. Выполните экспорт:
   - Безопасность: `python tools/security/export_security_backlog.py --timestamp --azure-csv outbox/security-backlog-tasks-azure.csv`
   - Stage 1: `python tools/security/export_security_backlog.py --input docs/internal/stage1-pass-thru-backlog.md --output outbox/stage1-pass-thru-backlog.json --timestamp --azure-csv outbox/stage1-pass-thru-backlog-azure.csv`
2. Проверьте, что JSON содержит ожидаемое число задач, а CSV открывается в Excel/LibreOffice без искажений кодировки (UTF-8).
3. Зафиксируйте контрольную сумму файлов при необходимости (для пересылки во внешние команды).

## 2. Импорт в Azure Boards

1. Откройте проект → Boards → Backlogs → кнопка `...` → `Import work items from CSV`.
2. Загрузите соответствующий CSV (`security-backlog-tasks-azure.csv` или `stage1-pass-thru-backlog-azure.csv`).
3. Укажите тип создаваемых задач (например, `Task` или `User Story`).
4. На шаге сопоставления полей свяжите колонки:
   - `Title` → Title
   - `Description` → Description (HTML формат поддерживается)
   - `Assigned To` → Assigned To (оставьте пустым, если указаны роли, не учётные записи)
   - `Due Date` → Target Date (опционально)
   - `Tags` → Tags
   - `Category` → используйте для заполнения `Area Path` или добавьте в описание
5. После импорта добавьте ссылки на созданные карточки в исходных документах (`docs/tech/update-security-implementation-plan.md`, `docs/internal/stage1-pass-thru-backlog.md`).

## 3. Импорт в Jira (альтернативный вариант)

1. Для Jira Data Center/Cloud используйте меню `Jira settings → System → External System Import → CSV`.
2. Загрузите CSV, выберите проект.
3. На шаге сопоставления свяжите поля:
   - `Title` → Summary
   - `Description` → Description (включите опцию HTML, если доступно)
   - `Assigned To` → Assignee (при отсутствии пользователей оставьте пустым)
   - `Due Date` → Due Date
   - `Tags` → Labels (установите разделитель `;`)
   - `Category` → Custom Field «Backlog Category» или добавьте в Description.
4. После импорта сохраните отчёт об успешном создании задач и приложите ссылки в соответствующие документы.

## 4. Обновление документации

- После импорта отметьте статусы задач в `docs/tech/update-security-implementation-plan.md` и `docs/tech/stage1-kiosk-agent-plan.md`.
- Добавьте ссылки на карточки в `docs/internal/update-security-meeting-notes-20251015.md` и `docs/internal/notes/2025-10-15-security-infra-meeting-notes.md`.
- Обновите таблицу соответствия в `docs/internal/update-security-plan-backlog-map.md` (статусы, ссылки, отклонения по срокам).
- При отправке follow-up письма (`docs/internal/update-security-meeting-followup-template.md`) включите список созданных задач.

## 5. Контроль версий файлов

- Храните копию CSV/JSON в `outbox/` до завершения Stage 1.
- При каждом переэкспорте фиксируйте дату/время в `logs/security-infra-meeting-20251015.jsonl` или отдельном журнале.
- Удаляйте устаревшие файлы после подтверждения, что трекер содержит актуальные данные.
