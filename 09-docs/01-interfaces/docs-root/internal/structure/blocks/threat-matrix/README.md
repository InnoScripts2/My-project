# Блок `threat-matrix`

> Цель: выявить угрозы и зафиксировать меры противодействия для каждого компонента киоска.

## Таблица угроз

| ID | Угроза | Компонент | Вероятность | Влияние | Мониторинг | Меры реагирования |
| --- | --- | --- | --- | --- | --- | --- |
| TM-001 | Потеря соединения с OBD-адаптером | `apps/kiosk-agent` (драйвер OBD) | средняя | высокая | `device-obd` watchdog, метрика `obd.disconnected_count` | см. `../redundancy/obd-agent.md`, `monitoring-plan.md` |
| TM-002 | Отказ толщиномера | `apps/kiosk-agent` (модуль толщиномера) | низкая | высокая | логи `device-thickness`, проверка калибровки каждую смену | см. `../redundancy/thickness-device.md`, `monitoring-plan.md` |
| TM-003 | Сбой оплаты | `payments` | средняя | высокая | таймер webhook'ов, алерт `payments.pending_over_90s` | см. `../fallbacks/payments-manual.md`, `monitoring-plan.md` |
| TM-004 | Электропитание киоска | `infra/kiosk` | низкая | критическая | датчик напряжения, алерт `power.fail` | см. `../redundancy/power-backup.md`, `monitoring-plan.md` |
| TM-005 | Утечка данных клиентов | `storage`, `reports` | низкая | критическая | аудит чтений (`logs/data-access.log`), контрольные суммы отчётов | см. `../shielding/data-protection-checklist.md`, `../shielding/data-breach-operator-checklist.md` |

## Следующие шаги

1. Провести аудит фактических инцидентов и расширить таблицу.
2. Для каждой угрозы привязать конкретные инструкции в соседних блоках (`redundancy/`, `fallbacks/`, `shielding/`).
3. Реализовать план мониторинга (`monitoring-plan.md`): метрики + алерты в агенте.
4. Подготовить контрольный список тестов: что проверяем после обновления ПО, чтобы не вызвать угрозу повторно.
