# Thickness Driver - BLE драйвер для толщиномера ЛКП

Драйвер для работы с толщиномером лакокрасочного покрытия через BLE GATT профиль.

## Архитектура

```
driver/
  ThicknessDriver.ts    - Основной класс драйвера
  errors.ts             - Кастомные классы ошибок

ble/
  BleClient.ts          - Интерфейс BLE клиента
  NobleBleClient.ts     - Реализация с @abandonware/noble
  DevBleClient.ts       - Dev mock клиент

gatt/
  profile.ts            - GATT профиль, UUIDs, парсеры

models/
  Measurement.ts        - Модели данных измерений

database/
  zones.json            - База зон кузова (60 точек)
```

## BLE GATT Profile

### Service UUID
`0000FFF0-0000-1000-8000-00805F9B34FB`

### Characteristics

#### Measurement (0000FFF1)
- Properties: Read, Notify
- Format: [zoneId: byte, valueHigh: byte, valueLow: byte]
- zoneId: 0-59
- value: (valueHigh << 8) | valueLow (микроны)

#### Control (0000FFF2)
- Properties: Write
- Commands:
  - 0x01: Start measurement
  - 0x02: Stop measurement
  - 0x03: Reset

#### Status (0000FFF3)
- Properties: Read
- Values:
  - 0x00: Idle
  - 0x01: Measuring
  - 0xFF: Error

## Зоны кузова

60 зон измерений:
- Капот: 6 зон
- Крыша: 9 зон
- Двери: 8 зон (передние/задние, верх/низ)
- Крылья: 8 зон
- Пороги: 4 зоны
- Багажник: 4 зоны
- Стойки: 6 зон
- Кромки: 8 зон
- Бамперы: 7 зон

Нормы ЛКП: 80-150 микрон (заводское покрытие)

## Использование

### Базовый пример

```typescript
import { ThicknessDriver } from './driver/ThicknessDriver.js';

const driver = new ThicknessDriver({
  targetDeviceName: 'TH_Sensor',
  totalZones: 60,
});

driver.on('device-detected', (info) => {
  console.log('Устройство обнаружено:', info.name);
});

driver.on('connected', () => {
  console.log('Подключено');
});

driver.on('measurement-received', (point) => {
  console.log(`Зона ${point.zoneName}: ${point.value} мкм`);
});

driver.on('measurement-complete', (summary) => {
  console.log('Измерения завершены:', summary.measuredZones, 'зон');
});

await driver.init();
await driver.start();

await new Promise(resolve => 
  driver.on('measurement-complete', resolve)
);

const measurements = driver.getMeasurements();
await driver.disconnect();
```

### Обработка ошибок

```typescript
driver.on('error', (error) => {
  console.error('Ошибка:', error.message);
  
  if (error instanceof ThicknessConnectionError) {
    console.error('Ошибка подключения:', error.details);
  }
});

driver.on('disconnected', () => {
  console.log('Устройство отключено');
  const partial = driver.getMeasurements();
  savePartialData(partial);
});
```

### Мониторинг прогресса

```typescript
driver.on('measurement-progress', (progress) => {
  console.log(
    `Прогресс: ${progress.measured}/${progress.total} (${progress.percent}%)`
  );
  updateUI(progress);
});
```

## События

| Событие | Payload | Описание |
|---------|---------|----------|
| device-detected | DeviceInfo | Устройство обнаружено |
| connected | void | Подключение установлено |
| measurement-started | void | Начата сессия измерений |
| measurement-received | MeasurementPoint | Получено измерение |
| measurement-progress | Progress | Обновление прогресса |
| measurement-complete | SessionSummary | Завершена сессия |
| disconnected | void | Устройство отключено |
| error | Error | Ошибка |

## Конфигурация

```typescript
interface ThicknessConfig {
  scanTimeout?: number;             // Таймаут сканирования (default: 15000ms)
  connectionTimeout?: number;       // Таймаут подключения (default: 10000ms)
  measurementTimeout?: number;      // Таймаут измерений (default: 300000ms)
  targetDeviceName?: string;        // Имя устройства (default: 'TH_Sensor')
  targetMAC?: string;              // MAC адрес (optional)
  totalZones?: number;             // Количество зон (default: 60)
  autoReconnect?: boolean;         // Автоматическое переподключение (default: true)
  maxReconnectAttempts?: number;   // Макс. попыток переподключения (default: 3)
}
```

### Файл конфигурации

`config/thickness.json`:

```json
{
  "scanTimeout": 15000,
  "connectionTimeout": 10000,
  "measurementTimeout": 300000,
  "targetDeviceName": "TH_Sensor",
  "totalZones": 60,
  "normMin": 80,
  "normMax": 150,
  "autoReconnect": true,
  "maxReconnectAttempts": 3
}
```

## Состояния

```
IDLE → SCANNING → CONNECTING → CONNECTED → MEASURING → COMPLETE/INCOMPLETE
                                     ↓
                               UNAVAILABLE/ERROR
```

- **IDLE**: Начальное состояние
- **SCANNING**: Сканирование BLE устройств
- **CONNECTING**: Подключение к устройству
- **CONNECTED**: Готово к измерениям
- **MEASURING**: Идут измерения
- **COMPLETE**: Все зоны измерены
- **INCOMPLETE**: Прервано/таймаут
- **ERROR**: Ошибка
- **UNAVAILABLE**: Устройство недоступно

## Обработка разрывов

При разрыве соединения:
1. Emit события `disconnected`
2. Сохранение partial data
3. Автоматическое переподключение (если `autoReconnect=true`)
4. Exponential backoff: 5s → 10s → 20s
5. После 3 разрывов → статус `UNAVAILABLE`

## DEV режим

```bash
AGENT_ENV=DEV npm run dev
```

В DEV режиме:
- Используется `DevBleClient` (mock)
- Эмуляция сканирования и подключения
- Mock measurements с фиксированным значением 100 мкм
- Автоматическая генерация 60 измерений (1 в секунду)
- Без реального BLE адаптера

## Тестирование

```bash
npm test -- src/devices/thickness/**/*.test.ts
```

### Unit тесты
- `models/__tests__/Measurement.test.ts` - тесты моделей
- `driver/__tests__/ThicknessDriver.test.ts` - тесты драйвера
- `gatt/__tests__/profile.test.ts` - тесты GATT парсеров

### Integration тесты
- `__tests__/integration.test.ts` - полный цикл с mock устройством

## Метрики

Prometheus метрики:

```
thickness_sessions_total{status}
thickness_measurements_total{zoneId}
thickness_session_duration_seconds
thickness_errors_total{type}
```

## Логирование

Structured JSON logs:

```json
{
  "timestamp": "2025-01-07T10:00:00.000Z",
  "level": "info",
  "module": "ThicknessDriver",
  "message": "Устройство обнаружено",
  "context": {
    "deviceId": "dev-thickness-device",
    "deviceName": "TH_Sensor",
    "rssi": -60
  }
}
```

Уровни:
- **debug**: Каждое измерение
- **info**: Статусы, подключение/отключение
- **warn**: Таймауты, повторные попытки
- **error**: Сбои, ошибки

## Troubleshooting

### Устройство не обнаруживается
- Проверить BLE адаптер: `hciconfig` (Linux) / Device Manager (Windows)
- Проверить, что устройство включено и в режиме сопряжения
- Увеличить `scanTimeout`
- Проверить `targetDeviceName` / `targetMAC`

### Таймаут подключения
- Проверить расстояние до устройства
- Проверить помехи (другие BLE устройства)
- Увеличить `connectionTimeout`
- Перезапустить BLE адаптер

### Разрыв во время измерений
- Проверить расстояние
- Проверить заряд батареи устройства
- Включить `autoReconnect`
- Увеличить `maxReconnectAttempts`

### @abandonware/noble не установлен
```bash
npm install @abandonware/noble
```

Windows: может потребоваться установка Visual Studio Build Tools

## Диаграмма последовательности

```
Client          Driver          BLE Device
  |               |                 |
  |-- init() ---->|                 |
  |               |-- scan -------->|
  |               |<- discover -----|
  |<- device-detected --|           |
  |               |-- connect ----->|
  |               |<- connected ----|
  |<- connected --|                 |
  |               |-- discover services ->|
  |               |-- subscribe notify -->|
  |               |                 |
  |-- start() --->|                 |
  |               |-- write START ->|
  |<- measurement-started --|       |
  |               |<- notify [zoneId,value] --|
  |<- measurement-received --|      |
  |               |... (repeat) ... |
  |<- measurement-complete --|      |
  |               |                 |
  |-- disconnect() ->|              |
  |               |-- disconnect -->|
  |               |                 |
```

## Roadmap

### Фаза 1 (текущая)
- Базовый драйвер BLE GATT
- 60 зон измерений
- Real-time notify
- DEV mock

### Фаза 2
- Batch-read поддержка
- Ускорение измерений
- Калибровка устройства

### Фаза 3
- Настройка норм по типу ЛКП
- Поддержка разных моделей толщиномеров
- Универсальный драйвер

### Фаза 4
- OTA updates для устройства
- Firmware management
- Диагностика устройства
