# Протоколы интеграции OBD-II и Толщиномера

## OBD-II протокол

### Общие сведения

Используется стандарт ELM327 для взаимодействия с адаптером OBD-II через последовательный порт (COM/Serial) или Bluetooth.

### Основные команды

#### Инициализация
```
ATZ         - Сброс адаптера
ATE0        - Отключить эхо
ATL0        - Отключить перевод строки
ATSP0       - Автоматический выбор протокола
```

#### Чтение кодов неисправностей (DTC)
```
03          - Считать подтверждённые коды
07          - Считать pending коды
0A          - Считать permanent коды
```

#### Очистка кодов
```
04          - Очистить коды и индикатор MIL
```

#### Чтение статусов
```
0101        - Статус MIL и количество DTC
01XX        - Чтение PID (XX - номер параметра)
09XX        - Информация о транспортном средстве
```

### Формат ответов

- Успешный ответ: `41 XX YY YY` (где 41 = ответ на режим 01)
- Ошибка: `NO DATA`, `UNABLE TO CONNECT`, `BUS INIT: ERROR`
- DTC формат: P0XXX, C0XXX, B0XXX, U0XXX

### Таблица расшифровки DTC

Используем открытые источники и стандартные коды:
- P0XXX - Powertrain (двигатель, трансмиссия)
- C0XXX - Chassis (подвеска, тормоза, рулевое)
- B0XXX - Body (кузовная электроника)
- U0XXX - Network (сетевые коммуникации)

Полная база кодов: собственная таблица на основе открытых стандартов ISO 15031-6 и SAE J2012.

### Интерфейсы драйвера

```typescript
// packages/device-obd/src/types.ts
export interface ObdDriver {
  init(): Promise<void>;
  readDtc(): Promise<DtcCode[]>;
  clearDtc(): Promise<boolean>;
  readPid(pid: string): Promise<number | null>;
  disconnect(): Promise<void>;
}

export interface DtcCode {
  code: string;          // P0301
  description: string;   // Cylinder 1 Misfire Detected
  severity: 'critical' | 'warning' | 'info';
}
```

### Ошибки и таймауты

- Таймаут команды: 5 секунд
- Таймаут инициализации: 10 секунд
- Повторные попытки: 3 раза с экспоненциальной задержкой
- Коды ошибок: `OBD_NOT_CONNECTED`, `OBD_TIMEOUT`, `OBD_INVALID_RESPONSE`

## Протокол Толщиномера

### Общие сведения

Интеграция через официальный SDK или GATT профиль BLE (если опубликован вендором).

**Важно**: Используем только документированные интерфейсы. Реверс-инжиниринг запрещён.

### Структура измерений

40-60 точек замера на автомобиле, распределённые по зонам:

```typescript
// packages/device-thickness/src/types.ts
export interface ThicknessPoint {
  zone: string;          // "hood_front_left"
  value: number;         // микроны (µm)
  timestamp: Date;
  valid: boolean;
}

export interface ThicknessMeasurement {
  sessionId: string;
  vehicleType: 'sedan' | 'hatchback' | 'minivan';
  points: ThicknessPoint[];
  startedAt: Date;
  completedAt?: Date;
}
```

### Зоны измерения

**Седан/Хэтчбек (40 точек):**
- Капот: 4 точки
- Передние крылья: 4 точки (2 на каждое)
- Передние двери: 4 точки (2 на каждую)
- Задние двери: 4 точки (2 на каждую)
- Задние крылья: 4 точки (2 на каждое)
- Крышка багажника: 4 точки
- Крыша: 6 точек
- Стойки: 6 точек
- Пороги: 4 точки

**Минивэн (60 точек):**
- Все зоны седана +
- Дополнительные зоны третьего ряда
- Раздвижные двери

### Интерфейсы драйвера

```typescript
// packages/device-thickness/src/types.ts
export interface ThicknessDriver {
  init(): Promise<void>;
  startMeasurement(vehicleType: string): Promise<string>; // returns sessionId
  measure(zone: string): Promise<ThicknessPoint>;
  stop(): Promise<ThicknessMeasurement>;
  disconnect(): Promise<void>;
}
```

### Ошибки и таймауты

- Таймаут соединения: 10 секунд
- Таймаут измерения: 30 секунд
- Коды ошибок: `THICKNESS_NOT_CONNECTED`, `THICKNESS_SDK_ERROR`, `THICKNESS_TIMEOUT`

## Безопасность и приватность

- Не хранить данные измерений дольше необходимого
- Логировать только технические события, без персональных данных
- SDK ключи и токены только через переменные окружения
- Все соединения в локальной сети (Bluetooth/Serial)

## Ссылки

- ELM327 Command Set: https://www.elmelectronics.com/wp-content/uploads/2017/01/ELM327DS.pdf
- ISO 15031-6: Diagnostic trouble code definitions
- SAE J2012: Diagnostic Trouble Code Definitions
- Документация SDK толщиномера: (ссылка предоставляется вендором)

## Примечания

- Все измерения и диагностика выполняются в реальном времени
- Dev-режим: только кнопка "Пропустить" для навигации, без симуляции данных
- Prod-режим: только реальные данные от устройств
