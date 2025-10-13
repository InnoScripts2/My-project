# PID Decoders Module — Research Notes

**Дата:** 2025-10-05  
**Автор:** GitHub Copilot AI Agent  
**Задача:** Создание модуля декодирования PID для OBD-II Mode 01

## Цель и контекст

Создан самостоятельный модуль `pidDecoders.ts` для парсинга оперативных параметров двигателя (Live Data) через OBD-II протокол Mode 01. Модуль содержит чистые функции без побочных эффектов и полностью покрыт unit-тестами.

## Источники вдохновения (без копирования кода)

### Bluetooth-OBD-II-Diagnostic-Tool
**Расположение:** `партнёрские программы/Bluetooth-OBD-II-Diagnostic-Tool-main`

**Заимствованные идеи:**
- Классификация декодеров по типам: arithmetic (арифметический), bit (битовый), ascii (текстовый)
- Структура реестра декодеров с метаданными (PID, имя, единицы измерения, формула)
- Паттерн централизованного реестра для расширяемости

**НЕ использовано:**
- Конкретные реализации функций парсинга
- Структуры данных и именование переменных
- UI-компоненты или бизнес-логика

### SAE J1979 & ISO 15031-5
**Источник:** Открытые стандарты OBD-II

**Использованные спецификации:**
- PID 0C: Engine RPM — `((A * 256) + B) / 4` → 0-16,383.75 об/мин
- PID 05/0F: Temperature — `A - 40` → -40 to 215°C
- PID 0D: Vehicle Speed — `A` → 0-255 км/ч
- PID 42: Control Module Voltage — `((A * 256) + B) / 1000` → 0-65.535 В
- PID 11: Throttle Position — `(A * 100) / 255` → 0-100%

## Архитектура решения

### Структура модуля

```typescript
// Интерфейсы
export type DecoderKind = 'arith' | 'bit' | 'ascii';
export interface DecoderEntry {
  pid: string;
  kind: DecoderKind;
  name: string;
  unit?: string;
  parse: (payload: string) => number | string | undefined;
}

// Реестр декодеров
export const PID_DECODERS: Record<string, DecoderEntry> = { ... }

// Публичные API
export function parsePid(pid: string, payload: string): number | string | undefined
export function getDecoderInfo(pid: string): Omit<DecoderEntry, 'parse'> | undefined
export function getSupportedPids(): string[]
```

### Принципы реализации

1. **Чистые функции:** Все parse-функции детерминированные, без side-effects
2. **Обработка ошибок:** Возврат `undefined` для некорректных данных (вместо исключений)
3. **Гибкость парсинга:** Поддержка различных форматов whitespace и регистра через `split(/\s+/)` и нормализацию
4. **Расширяемость:** Новые PIDs добавляются простым расширением реестра `PID_DECODERS`

### Граничные случаи

Модуль корректно обрабатывает:
- Некорректные hex-значения (возврат `undefined`)
- Недостаточное количество байт в payload
- Лишние пробелы и mixed case в входных данных
- NaN результаты (преобразуются в `undefined`)

## Интеграция с Elm327Driver

### Изменения в `Elm327Driver.ts`

**До:**
```typescript
rpm: rpm != null ? parseRpm(rpm) : undefined
```

**После:**
```typescript
rpm: rpm != null ? (parsePid('0C', rpm) as number) : undefined
```

### Преимущества интеграции

- ✅ Единая точка определения формул декодирования
- ✅ Упрощение добавления новых PIDs
- ✅ Централизованная документация (имя, единицы измерения)
- ✅ Готовность к расширению на UI-слой (метаданные доступны через `getDecoderInfo`)

### Обратная совместимость

Публичный API `Elm327Driver.readLiveData()` не изменился:
- Возвращаемая структура `ObdLiveData` та же
- Типы данных идентичны
- Поведение при ошибках сохранено

## Тестирование

### Покрытие тестами

**Файл:** `pidDecoders.test.ts` (53 теста, 100% success rate)

Категории тестов:
1. **Happy path:** Корректные данные для всех PIDs (6 PIDs × ~2 теста)
2. **Edge cases:** Минимальные/максимальные значения (10 тестов)
3. **Error handling:** Некорректные входы, NaN, пустые данные (7 тестов)
4. **Metadata API:** `getDecoderInfo`, `getSupportedPids`, валидация реестра (10 тестов)
5. **Граничные значения:** Проверка формул на крайних точках (10 тестов)

### Результаты проверок

```bash
✅ npm test — 61 tests pass
✅ npm run typecheck:strict — 0 errors
✅ npm run lint:eslint — 0 warnings
```

## Пути к файлам

**Код:**
- `03-apps/02-application/kiosk-agent/src/devices/obd/pidDecoders.ts` (184 строки)
- `03-apps/02-application/kiosk-agent/src/devices/obd/pidDecoders.test.ts` (340 строк)

**Изменения:**
- `03-apps/02-application/kiosk-agent/src/devices/obd/Elm327Driver.ts` (+1 import, 6 строк в `readLiveData`)

**Документация:**
- `09-docs/01-interfaces/docs-root/internal/research-notes/pid-decoders.md` (этот файл)

## Соответствие лицензиям и правилам проекта

### Проверка легальности

- ✅ Нет копирования кода из партнёрских программ
- ✅ Использованы только открытые стандарты (SAE J1979, ISO 15031-5)
- ✅ Собственные имена переменных и структура кода
- ✅ Все формулы — из публичных спецификаций

### Соответствие архитектурным правилам

- ✅ Никаких симуляций данных в PROD (только реальный парсинг)
- ✅ Соблюдены правила `.github/instructions/instructions.instructions.md`
- ✅ Не затронута логика `ObdConnectionManager` и `connectOptions.ts`
- ✅ Публичные API документированы JSDoc
- ✅ Строгая типизация (TypeScript strict mode)

## Следующие шаги (возможные расширения)

1. **Дополнительные PIDs:** Расширение реестра (0A — Fuel Pressure, 04 — Calculated Engine Load, 33 — Barometric Pressure)
2. **Bit-decoders:** Реализация парсинга битовых флагов (например, PID 1C для стандарта OBD)
3. **ASCII-decoders:** Поддержка текстовых PIDs (VIN, ECU name)
4. **UI интеграция:** Использование метаданных (`getDecoderInfo`) для динамического отображения единиц измерения
5. **Мониторинг:** Добавление метрик Prometheus для частоты декодирования и ошибок парсинга

## Changelog

**v1.0 (2025-10-05):**
- Создан модуль `pidDecoders.ts` с поддержкой 6 PIDs
- Добавлены 53 unit-теста
- Интегрировано в `Elm327Driver.readLiveData()`
- Пройдены все quality gates (typecheck, lint, test)

---

**Заключение:** Модуль готов к использованию в продакшне. Легальность подтверждена, качество проверено, расширяемость заложена.
