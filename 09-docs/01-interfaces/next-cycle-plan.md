# План следующего цикла (реализация доменных компонентов)

Цель: наполнить созданные каркасы реальным кодом без нарушения границ модулей.

## Эпики и размещение

1) OBD‑II минимальная интеграция
   - Код: `02-domains/03-domain/device-obd/**`
   - Адаптеры порта/Serial: `05-integrations/04-infrastructure/serial/**`
   - Роуты агента: `03-apps/02-application/kiosk-agent/src/api/obd/**`
2) Толщиномер базовая интеграция
   - Код: `02-domains/03-domain/device-thickness/**`
   - BLE/GATT/SDK адаптер: `05-integrations/04-infrastructure/ble/**`
   - Экран измерений: `03-apps/02-application/kiosk-frontend/**`
3) Платежи (реальный провайдер)
   - Домен: `02-domains/03-domain/payments/**`
   - Провайдер: `05-integrations/04-infrastructure/payments/**`
   - Edge Function/webhook: `06-infra/04-infrastructure/functions/**`
4) Отчёты (PDF/HTML)
   - Домен: `02-domains/03-domain/report/**`
   - Пакет генератора: `04-packages/**`
   - Отправка email/SMS: `05-integrations/04-infrastructure/notify/**`
5) Замок выдачи
   - Контроллер: `03-apps/02-application/kiosk-agent/src/locks/**`
   - Драйвер реле: `05-integrations/04-infrastructure/relay/**`

## Quality Gates

- `npm --prefix apps/kiosk-agent test` — PASS
- `npm run lint` — PASS
- `npm run typecheck:strict` — 0 ошибок
