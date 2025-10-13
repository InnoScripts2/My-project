# Блоки защищённости

> Каталог фиксирует аварийные сценарии, угрозы и запасные планы. Каждый подпроект получает собственную "капсулу" с инструкциями.

## Структура

| Подкаталог | Назначение | Статус |
| --- | --- | --- |
| `threat-matrix/` | Карты угроз, анализ рисков, привязка к компонентам. | заведено |
| `redundancy/` | План резервирования, зеркальные цепочки снабжения (см. частные runbook'и). | заведено |
| `fallbacks/` | Последовательность шагов при отказе основной схемы (см. сценарии). | заведено |
| `shielding/` | Укрепление инфраструктуры, безопасность данных (есть чеклисты). | заведено |
| `evacuation/` | Аварийное восстановление, перенос на альтернативные площадки (runbook'и). | заведено |
 Каждый блок можно считать самостоятельной капсулой: внутри него лежат runbook'и, чеклисты и сценарии, которые актуализируем по мере внедрения (см. перечень ниже).
> Для каждой папки создаём `README.md` и при необходимости дополнительные файлы сценариев.

## Текущие документы

- `threat-matrix/README.md`, `monitoring-plan.md`
- `redundancy/README.md`, `obd-agent.md`, `thickness-device.md`, `power-backup.md`
- `fallbacks/README.md`, `ui-routes.md`, `payments-manual.md`
- `shielding/README.md`, `data-protection-checklist.md`, `data-breach-operator-checklist.md`
- `evacuation/README.md`, `runbook-standby-kiosk.md`, `runbook-power-outage.md`, `runbook-software-compromise.md`
