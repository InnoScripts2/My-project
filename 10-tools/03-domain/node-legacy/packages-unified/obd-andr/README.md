# @selfservice/obd-andr

Базовые компоненты OBD-II, совместимые с AndrOBD: декодеры PID (Mode 01), декодер DTC SAE J2012, утилиты ELM327.

Назначение: поэтапная миграция функционала AndrOBD в монорепозиторий и интеграция c `kiosk-agent`.

## Сборка и тесты

- Сборка: `npm --prefix packages-unified/obd-andr run build`
- Тесты: `npm --prefix packages-unified/obd-andr test`

## Экспорты

- `buildMode01PidRequest(pid)` — строка запроса `01 <PID>`
- `decodeMode01(line)` — разбор строки ответа `41 <PID> <DATA...>` в структурированное значение
- `decodeDtcList(bytes)` — список DTC из сырых байт

