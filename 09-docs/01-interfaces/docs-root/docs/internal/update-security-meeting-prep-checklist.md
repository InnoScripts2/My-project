# Чек-лист подготовки к встрече по внедрению безопасности обновлений

## За 2 дня до встречи
- [ ] Отправлено приглашение согласно `docs/internal/update-security-meeting-invite.md`.
- [ ] Подтверждено время и формат встречи.
- [ ] Собраны и размещены материалы в общей папке (повестка, план внедрения, требования, manifest).
- [ ] Добавлены документы о журнале подписей (`docs/tech/signing-log-format.md`, `docs/internal/signing-log-audit-checklist.md`) и скрипт `tools/data-migration/check_signing_log.py`.
- [ ] Проверена актуальность ключей и артефактов в `keys/` и `dist/`.

## За 1 день до встречи
- [ ] Повестка `docs/tech/update-security-infra-meeting.md` актуальна (проверены ссылки и задачи).
- [ ] План `docs/tech/update-security-implementation-plan.md` дополнен свежими данными (при необходимости).
- [ ] Обновлены статусы рисков и блокеров в документах Stage 0.
- [ ] Проведена тестовая демонстрация `python tools/data-migration/check_signing_log.py --skip-path-checks` (при отсутствии доступа к артефактам).
- [ ] Разосланы предварительные материалы и напоминание участникам.

## В день встречи
- [ ] Подготовлена площадка для заметок `docs/internal/update-security-meeting-notes-template.md`.
- [ ] Доступна демонстрация проверки подписи (`tools/data-migration/verify_package.py`).
- [ ] Проверен канал связи/конференц-платформа.

## После встречи
- [ ] Заполнен протокол по шаблону `docs/internal/update-security-meeting-notes-template.md`.
- [ ] Решения и задачи перенесены в трекер.
- [ ] Обновлены `docs/windows-app-analysis.md` и `docs/internal/update-playbook.md`.
- [ ] Отправлено follow-up письмо с протоколом и задачами.
