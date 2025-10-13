# Часть 2: node-obd2-master и Android проекты

**Дата:** 6 октября 2025
**Статус:** Часть 2/5
**Фокус:** Расширенные Node.js возможности + Android референсы

---

## 2.1 Проект: node-obd2-master

**Размер:** 395 файлов
**Лицензия:** MIT (совместима с проектом)
**Приоритет:** 🟡 ВЫСОКИЙ - расширенная функциональность
**Автор:** Bence Sipos (sipimokus)
**GitHub:** https://github.com/sipimokus/node-obd2

### Описание

Комплексная TypeScript библиотека для связи с OBD-II устройствами. Значительно более полная, чем node-bluetooth-obd (395 файлов против 10).

### Ключевые отличия от node-bluetooth-obd

| Параметр | node-bluetooth-obd | node-obd2 |
|----------|-------------------|-----------|
| Язык | JavaScript (ES5) | TypeScript |
| Размер | 10 файлов | 395 файлов |
| Архитектура | Монолитный класс | Модульная структура |
| Транспорт | Только Bluetooth | USB, Bluetooth, Fake |
| Mode 01 PIDs | ~20 | 50+ (PID 00-37) |
| Mode 03 (DTC) | ❌ Нет | ✅ Да (в roadmap) |
| Типизация | Нет | TypeScript строгая |
| Тесты | Базовые | Mocha + Fake Serial |
| Документация | README | TypeDoc + примеры |

### Технические характеристики

**package.json:**
```json
{
  "name": "obd2",
  "version": "0.1.2",
  "main": "index.js",
  "license": "MIT",
  "dependencies": {
    "debug": "^2.2.0",
    "serialport": "^2.0.6"
  },
  "devDependencies": {
    "mocha": "^2.4.5",
    "typescript": "^1.7.5",
    "typedoc": "^0.3.12"
  }
}
```

**Зависимости:**
- `serialport@2.0.6` - устаревшая версия (текущая 12.x)
- `debug@2.2.0` - для логирования
- TypeScript 1.7.5 - очень старая версия (сейчас 5.x)

**⚠️ ВАЖНО:** Проект beta-качества, требует значительной модернизации.

### Архитектура проекта

```
node-obd2-master/
├── src/
│   ├── index.ts              # Main entry point
│   ├── core/
│   │   ├── obd.ts           # OBD класс (главный)
│   │   ├── pid.ts           # PID определения
│   │   ├── dtc.ts           # DTC обработка
│   │   ├── ticker.ts        # Polling механизм
│   │   └── fakeserial.ts    # Mock для тестов
│   ├── device/
│   │   └── elm327/          # ELM327 специфика
│   │       └── index.ts
│   ├── serial/
│   │   ├── base.ts          # Базовый транспорт
│   │   ├── bluetooth.ts     # Bluetooth транспорт
│   │   ├── usb.ts           # USB транспорт
│   │   ├── fake.ts          # Fake для DEV
│   │   └── index.ts
│   └── typings/
│       └── main.d.ts        # Type definitions
├── example/
│   └── server.js            # Express + Socket.IO пример
├── test/
│   └── *.test.js            # Mocha тесты
└── docs/                    # TypeDoc документация
```

### Поддерживаемые PIDs (Mode 01)

**Расширенный список (50+ PIDs):**

| PID | Slug | Описание | Единицы | Min | Max |
|-----|------|----------|---------|-----|-----|
| 00 | pidsupp0 | PIDs supported 00-20 | BIT | - | - |
| 01 | dtc_cnt | Monitor status since DTCs cleared | BIT | - | - |
| 04 | load_pct | Calculated LOAD Value | % | 0 | 100 |
| 05 | temp | Engine Coolant Temperature | °C | -40 | 215 |
| 0C | rpm | Engine RPM | r/m | 0 | 16383.75 |
| 0D | vss | Vehicle Speed Sensor | km/h | 0 | 255 |
| 0E | sparkadv | Ignition Timing Advance | ° | -64 | 63.5 |
| 0F | iat | Intake Air Temperature | °C | -40 | 215 |
| 10 | maf | Mass Air Flow | g/s | 0 | 655.35 |
| 11 | throttlepos | Absolute Throttle Position | % | 0 | 100 |
| 1F | runtm | Time Since Engine Start | sec | 0 | 65535 |
| 21 | mil_dist | Distance with MIL Activated | km | 0 | 65535 |
| 2C | edr_pct | Commanded EGR | % | 0 | 100 |
| 2F | fuellevel | Fuel Level Input | % | 0 | 100 |
| 31 | clr_dist | Distance since DTC cleared | km | 0 | 65535 |
| 33 | baro | Barometric Pressure | kPa | 0 | 255 |

**Уникальные PIDs (отсутствуют в node-bluetooth-obd):**
- Fuel Trim (PIDs 06-09)
- Oxygen Sensor data (PIDs 14-1B)
- OBD standards compliance (PID 1C)
- Fuel Rail Pressure variants (PIDs 22-23)
- EGR/EVAP data (PIDs 2C-2F)

### Преимущества для интеграции

✅ **MIT лицензия** - полная свобода использования
✅ **TypeScript** - готовая типизация для kiosk-agent
✅ **Модульная архитектура** - легко извлекать отдельные части
✅ **USB поддержка** - критично для Windows киоска
✅ **Расширенные PIDs** - 50+ параметров (vs 20 в node-bluetooth-obd)
✅ **Fake Serial** - готовая система для DEV/тестов
✅ **TypeDoc** - автодокументация кода
✅ **Ticker система** - polling с контролем частоты

### Недостатки и ограничения

❌ **Beta качество** - автор предупреждает о нестабильности
❌ **Устаревшие зависимости** - TypeScript 1.7, serialport 2.0
❌ **Нет Mode 03/04** - в roadmap, но не реализовано
❌ **Неполная документация** - примеры минимальны
❌ **Нет активной разработки** - последний коммит давно

### План интеграции

**Этап 1: Извлечь расширенные PIDs (Неделя 4)**

```typescript
Задача: Добавить 30+ новых PIDs в PidDatabase
Источник: src/core/pid.ts
Цель: apps/kiosk-agent/src/devices/obd/database/PidDatabase.ts
Действия:
  1. Извлечь определения PIDs 00-37
  2. Конвертировать в наш формат TypeScript
  3. Добавить формулы конвертации
  4. Обновить тесты
  5. Документировать новые параметры
```

**Этап 2: Адаптировать USB транспорт (Неделя 4)**

```typescript
Задача: Добавить USB Serial поддержку
Источник: src/serial/usb.ts, src/serial/base.ts
Цель: apps/kiosk-agent/src/devices/obd/transports/UsbTransport.ts
Действия:
  1. Изучить паттерн транспорта
  2. Создать UsbTransport класс
  3. Обновить serialport до 12.x
  4. Интеграция с ObdConnectionManager
  5. Тесты с реальным USB ELM327
```

**Этап 3: Ticker/Polling улучшения (Неделя 5)**

```typescript
Задача: Улучшить PollingManager из Части 1
Источник: src/core/ticker.ts
Цель: apps/kiosk-agent/src/devices/obd/polling/PollingManager.ts
Действия:
  1. Изучить алгоритм Ticker
  2. Добавить priority queues
  3. Adaptive polling (частота по приоритету)
  4. Buffer overflow protection
  5. Метрики производительности
```

**Этап 4: Fake Serial для DEV (Неделя 5)**

```typescript
Задача: Создать mock для разработки без устройства
Источник: src/core/fakeserial.ts
Цель: apps/kiosk-agent/src/devices/obd/__mocks__/FakeObdDevice.ts
Действия:
  1. Портировать Fake Serial
  2. Добавить симуляцию реалистичных задержек
  3. Конфигурируемые сценарии (engine start, idle, drive)
  4. Интеграция с тестами
  5. DEV-only флаг
```

### Оценка трудозатрат

| Задача | Часы | Неделя | Приоритет |
|--------|------|--------|-----------|
| Извлечь PIDs 00-37 | 6 | 4 | 🟡 |
| USB Transport адаптация | 8 | 4 | 🟡 |
| Обновить serialport до 12.x | 4 | 4 | 🟡 |
| Ticker/Polling улучшения | 6 | 5 | 🟢 |
| Fake Serial для DEV | 4 | 5 | 🟢 |
| Тесты и документация | 4 | 5 | 🟢 |
| **ИТОГО** | **32 часа** | **2 недели** | - |

### Извлекаемые компоненты

**Priority 1 (критично):**
1. `src/core/pid.ts` → Расширенная PID база
2. `src/serial/usb.ts` → USB транспорт
3. `src/serial/base.ts` → Базовый транспорт интерфейс

**Priority 2 (важно):**
4. `src/core/ticker.ts` → Умный polling
5. `src/core/fakeserial.ts` → DEV mock
6. `src/device/elm327/index.ts` → ELM327 специфика

**Priority 3 (полезно):**
7. `example/server.js` → Socket.IO интеграция (референс)
8. TypeScript типы и интерфейсы

### Сравнение с node-bluetooth-obd

**Что использовать из node-bluetooth-obd:**
- Event-driven паттерн (более зрелый)
- Базовая PID база для проверки
- Примеры тестов

**Что использовать из node-obd2:**
- Расширенные PIDs (30+ дополнительных)
- TypeScript типы и структура
- USB транспорт
- Модульная архитектура
- Fake Serial для DEV

**Гибридный подход (рекомендуется):**
```typescript
// Базовая архитектура: node-bluetooth-obd (проверенная)
// + Расширения: node-obd2 (PIDs, USB, TypeScript)

class ObdDriver {
  // EventEmitter паттерн из node-bluetooth-obd
  // + TypeScript типизация из node-obd2
  // + USB транспорт из node-obd2
  // + Расширенные PIDs из node-obd2
}
```

### Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Beta качество кода | Высокая | Среднее | Тщательное тестирование, code review |
| Устаревшие зависимости | Высокая | Среднее | Обновить до современных версий |
| TypeScript 1.7 несовместимость | Средняя | Низкое | Переписать с современным TS 5.x |
| Неполная реализация Mode 03/04 | Высокая | Низкое | Использовать наш текущий код |

---

## 2.2 Проект: kotlin-obd-api-master

**Размер:** 52 файла
**Лицензия:** MIT
**Приоритет:** 🟢 СРЕДНИЙ - референс для android-kiosk
**Автор:** Elton Viana
**GitHub:** https://github.com/eltonvs/kotlin-obd-api

### Описание

Легковесная и developer-friendly Kotlin библиотека для OBD-II. Платформенно-агностичная с гибкой архитектурой подключения.

### Ключевые особенности

✅ **Pure Kotlin** - чистая реализация без нативных зависимостей
✅ **Platform Agnostic** - работает на JVM, Android
✅ **Гибкий транспорт** - InputStream/OutputStream интерфейс
✅ **Maintainability: A** - высокое качество кода (CodeClimate)
✅ **CI/CD** - GitHub Actions, автотесты
✅ **Maven Central** - легко подключить через Gradle/Maven

### Архитектура подключения

```kotlin
// Простая интеграция
val connection = ObdDeviceConnection(inputStream, outputStream)
val device = ObdRawDevice(connection)

// Запрос данных
val response = device.send("01 0C") // RPM
val rpm = response.processedValue
```

**Преимущество:** Можно подключить любой транспорт (Bluetooth, WiFi, USB), если есть streams.

### Применение для нашего проекта

**Для apps/android-kiosk:**

1. **Прямая интеграция** (если нужен Android OBD клиент)
   ```gradle
   implementation 'com.github.eltonvs:kotlin-obd-api:1.3.0'
   ```

2. **Референс алгоритмов** для apps/kiosk-agent
   - Парсинг OBD ответов
   - Формулы конвертации
   - Error handling паттерны

3. **Тестовые сценарии** для валидации нашей реализации

**Оценка ценности:** 6/10
- Высокое качество кода, но для Android (не Node.js)
- Можем использовать как референс
- Алгоритмы портируемые в TypeScript

### Извлекаемое

**Что изучить:**
1. Kotlin → TypeScript паттерны конвертации
2. Parsing алгоритмы (универсальны)
3. Тестовые данные для валидации
4. Архитектура transport abstraction

**Не копируем:** Весь Kotlin код (другой стэк)

---

## 2.3 Проект: android-obd-reader-master

**Размер:** 117 файлов
**Лицензия:** Требуется проверка
**Приоритет:** 🟢 СРЕДНИЙ - референс для android-kiosk

### Описание

Android библиотека для чтения OBD-II данных. Более комплексная, чем kotlin-obd-api.

### Применение

**Для android-kiosk:**
- Готовые Android UI компоненты
- Bluetooth SPP подключение
- Real-time графики данных

**Для kiosk-agent:**
- Референс алгоритмов
- Тестовые сценарии

**Оценка ценности:** 5/10
- Android-специфично
- Полезно для apps/android-kiosk (если будем расширять)
- Для kiosk-agent - только референс

---

## 2.4 Проект: AndrOBD-master

**Размер:** 425 файлов
**Лицензия:** GPL v3 (⚠️ копировать нельзя!)
**Приоритет:** 🔵 НИЗКИЙ - только референс

### Описание

Полное Android приложение для OBD-II диагностики. Самое крупное из Android проектов.

### ВАЖНО: Лицензия GPL v3

❌ **НЕ КОПИРУЕМ КОД** - GPL требует открытия всего проекта
✅ **Только изучаем** - UX паттерны, feature list
✅ **Референс** - какие функции полезны пользователям

### Что изучить (без копирования)

1. **Feature list** - какие возможности ценят пользователи
2. **UX flow** - как организован процесс диагностики
3. **DTC база** - структура (создать свою аналогичную)
4. **Графики** - какие визуализации полезны

**Оценка ценности:** 4/10
- Высокая ценность для понимания продукта
- GPL блокирует прямое использование кода
- Можем вдохновляться UX

---

## 2.5 Проект: AndrOBD-Plugin-master

**Размер:** 121 файл
**Лицензия:** Требуется проверка
**Приоритет:** 🔵 НИЗКИЙ - plugin архитектура

### Описание

Plugin система для AndrOBD. Показывает, как расширять функциональность.

### Применение

**Идея для kiosk-agent:**
- Plugin архитектура для vendor-специфичных PIDs
- Расширяемость без изменения ядра

**Оценка ценности:** 3/10
- Интересная архитектура
- Но для нашего масштаба избыточна

---

## Промежуточные выводы (Часть 2)

### Приоритеты интеграции

**🟡 ВЫСОКИЙ ПРИОРИТЕТ:**
1. **node-obd2-master** - 30+ дополнительных PIDs
2. **node-obd2-master** - USB транспорт для Windows
3. **node-obd2-master** - Fake Serial для DEV

**🟢 СРЕДНИЙ ПРИОРИТЕТ:**
4. **kotlin-obd-api** - референс алгоритмов
5. **android-obd-reader** - UI паттерны для android-kiosk

**🔵 НИЗКИЙ ПРИОРИТЕТ:**
6. **AndrOBD** - UX референс (GPL, не копируем)
7. **AndrOBD-Plugin** - архитектурный референс

### Рекомендуемый подход

**Гибрид node-bluetooth-obd + node-obd2:**

```typescript
// apps/kiosk-agent/src/devices/obd/

// Базовая архитектура: node-bluetooth-obd (стабильная)
drivers/
  ├── BluetoothObdDriver.ts    # Из node-bluetooth-obd
  └── UsbObdDriver.ts           # Из node-obd2 ✨

// Расширенные данные: node-obd2
database/
  ├── PidDatabase.ts            # Объединение обеих библиотек
  └── pids/
      ├── mode01-basic.ts       # PIDs 00-0F (node-bluetooth-obd)
      └── mode01-extended.ts    # PIDs 10-37 (node-obd2) ✨

// DEV инструменты: node-obd2
__mocks__/
  └── FakeObdDevice.ts          # Из node-obd2 ✨

// Умный polling: node-obd2
polling/
  └── PollingManager.ts         # Улучшенный Ticker ✨
```

### Следующие шаги (Неделя 4-5)

**Неделя 4:**
1. Извлечь PIDs 00-37 из node-obd2
2. Создать UsbTransport
3. Обновить serialport до 12.x
4. Тесты

**Неделя 5:**
1. Улучшить PollingManager
2. Создать FakeObdDevice
3. Интеграционные тесты
4. Документация

---

**Статус:** Часть 2 завершена (2/5)
**Следующая часть:** Vendor-специфичные PIDs (Honda, Hyundai/Kia)
**Прогресс:** 7/23 проекта проанализированы (30%)

