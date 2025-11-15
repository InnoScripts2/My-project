# Thickness Driver - Толщиномер ЛКП

Модуль для работы с толщиномером лакокрасочного покрытия через BLE.

## ВАЖНО: Требования для реальной интеграции

Для работы с реальным BLE устройством требуется:

1. **Официальная спецификация GATT профиля** от производителя толщиномера
2. **Официальный SDK** (если доступен)
3. **Документация по протоколу связи** (UUID сервисов, характеристик, формат данных)

**Без официальной спецификации интеграция невозможна по юридическим и техническим причинам.**

Текущая реализация - фреймворк, готовый к интеграции после получения спецификации.

## Архитектура

```
thickness/
  driver/
    DeviceThickness.ts     - Интерфейс толщиномера
    ThicknessDriver.ts     - Основной драйвер (требует спецификацию)
  database/
    zones.ts               - База зон кузова (40/60 точек)
  models/
    (будущие модели данных)
```

## Использование

### Базовый пример

```typescript
import { ThicknessDriver } from './devices/thickness/driver/ThicknessDriver.js';
import { ThicknessConfig } from './devices/thickness/driver/DeviceThickness.js';

const driver = new ThicknessDriver();

const config: ThicknessConfig = {
  deviceName: 'TH_Sensor',
  deviceAddress: 'XX:XX:XX:XX:XX:XX',
  totalZones: 40, // 40 для седана, 60 для минивэна
  connectionTimeout: 10000,
  measurementTimeout: 300000, // 5 минут
};

// Инициализация
await driver.init(config);

// Начать измерения
await driver.startMeasuring();

// Слушать измерения
driver.on('measurement_received', (measurement) => {
  console.log(`Zone ${measurement.zoneName}: ${measurement.value} ${measurement.unit}`);
});

// Завершение всех измерений
driver.on('measurement_complete', (summary) => {
  console.log('All zones measured:', summary.measuredZones);
  const measurements = driver.getMeasurements();
  console.log('Measurements:', measurements);
});

// Отключение
await driver.disconnect();
```

### События

```typescript
driver.on('device_detected', (info) => {
  console.log('Device detected:', info.name, info.address);
});

driver.on('connected', () => {
  console.log('Connected to thickness gauge');
});

driver.on('disconnected', () => {
  console.log('Disconnected from thickness gauge');
});

driver.on('measurement_received', (measurement) => {
  console.log('New measurement:', measurement);
});

driver.on('measurement_complete', (summary) => {
  console.log('Measurements complete:', summary);
});

driver.on('error', (error) => {
  console.error('Thickness gauge error:', error);
});
```

### Работа с зонами

```typescript
import { sedanZones, minivanZones } from './devices/thickness/database/zones.js';

// Получить зону по ID
const zone = sedanZones.getZone(15);
console.log('Zone:', zone.name, zone.description);

// Проверить нормальность толщины
const isNormal = sedanZones.isThicknessNormal(15, 110);
console.log('Is thickness normal:', isNormal);

// Получить отклонение от типичной толщины
const deviation = sedanZones.getDeviation(15, 150);
console.log('Deviation:', deviation, 'μm');

// Получить все зоны капота
const hoodZones = sedanZones.getZonesByCategory('hood');
console.log('Hood zones:', hoodZones.length);
```

## База зон кузова

### Седан (40 точек)

- Капот: 8 точек
- Крыша: 6 точек
- Передние крылья: 4 точки
- Передние двери: 6 точек
- Задние двери: 6 точек
- Задние крылья: 4 точки
- Багажник: 6 точек

### Минивэн/SUV (60 точек)

Включает все зоны седана плюс:

- Боковые панели: 6 точек
- Дополнительные точки крыши: 2 точки
- Бамперы: 6 точек
- Стойки: 6 точек

### Стандартная толщина ЛКП

| Зона | Минимум | Типичная | Максимум |
|------|---------|----------|----------|
| Капот | 80 μm | 120 μm | 150 μm |
| Крыша | 90 μm | 130 μm | 160 μm |
| Крылья | 70 μm | 110 μm | 140 μm |
| Двери | 75 μm | 115 μm | 145 μm |
| Бамперы | 100 μm | 150 μm | 200 μm |

## Интеграция с реальным устройством

После получения официальной спецификации необходимо реализовать:

### 1. BLE сканирование и подключение

```typescript
// В методе connect()
private async connect(): Promise<void> {
  // 1. Инициализировать BLE адаптер
  // 2. Сканировать устройства
  // 3. Найти устройство по имени/адресу
  // 4. Подключиться к GATT серверу
  // 5. Обнаружить сервисы
  // 6. Получить характеристики
}
```

### 2. Подписка на измерения

```typescript
// В методе startMeasuring()
async startMeasuring(): Promise<void> {
  // 1. Найти GATT characteristic для измерений
  // 2. Подписаться на уведомления
  // 3. Обрабатывать входящие данные
  // 4. Парсить формат данных согласно спецификации
  // 5. Вызывать handleMeasurement() для каждого измерения
}
```

### 3. Парсинг данных

```typescript
// Парсер зависит от протокола устройства
private parseMeasurementData(data: Buffer): { zoneId: number; value: number } {
  // Реализация согласно спецификации
}
```

### 4. Отключение

```typescript
// В методе disconnect()
async disconnect(): Promise<void> {
  // 1. Отписаться от уведомлений
  // 2. Отключиться от GATT сервера
  // 3. Закрыть BLE соединение
}
```

## Типичный GATT профиль (пример)

```
Service UUID: XXXX (требуется из спецификации)
├── Characteristic: Measurement
│   ├── UUID: YYYY (требуется)
│   ├── Properties: Notify
│   └── Format: { zoneId: uint8, value: uint16 }
├── Characteristic: Control
│   ├── UUID: ZZZZ (требуется)
│   ├── Properties: Write
│   └── Commands: Start, Stop, Reset
└── Characteristic: Status
    ├── UUID: WWWW (требуется)
    ├── Properties: Read, Notify
    └── Format: { battery: uint8, status: uint8 }
```

## Требуемая информация от производителя

Для интеграции необходимо получить:

1. **GATT Service UUID** - UUID сервиса устройства
2. **Characteristic UUIDs** - UUID характеристик (измерения, управление, статус)
3. **Формат данных** - Структура передаваемых данных
4. **Команды управления** - Протокол команд (старт, стоп, калибровка)
5. **Ошибки и статусы** - Коды ошибок и их значения
6. **Особенности протокола** - Таймауты, повторы, обработка разрывов

## DEV режим

В DEV режиме:

- Симулируется BLE подключение
- **НЕ** генерируются фиктивные измерения (запрещено)
- Доступна кнопка "Пропустить" в UI для перехода по экранам
- Логируются все операции с пометкой DEV

```bash
AGENT_ENV=DEV npm run dev
```

## Обработка ошибок

```typescript
import {
  DeviceConnectionError,
  DeviceTimeoutError,
  DeviceNotFoundError,
} from '../common/errors.js';

try {
  await driver.init(config);
} catch (error) {
  if (error instanceof DeviceNotFoundError) {
    console.error('Device not found:', error.message);
  } else if (error instanceof DeviceConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof DeviceTimeoutError) {
    console.error('Operation timed out:', error.message);
  }
}
```

## Storage

Состояния и события сохраняются в SQLite (`storage/devices.sqlite`):

```typescript
import { getDeviceStorage } from '../common/storage.js';

const storage = getDeviceStorage();
const state = storage.getState('thickness');
const events = storage.getRecentEvents('thickness', 100);
```

## Тестирование

### Unit тесты

```bash
npm --prefix apps/kiosk-agent test
```

### Интеграционные тесты

Требуется реальное устройство:

```bash
AGENT_ENV=DEV npm --prefix apps/kiosk-agent run self-check:thickness
```

## Зависимости

Для BLE интеграции потребуется:

```bash
npm install @abandonware/noble
npm install @types/noble --save-dev
```

Или другая BLE библиотека, рекомендованная производителем.

## Метрики

```typescript
const health = driver.getHealthStatus();
console.log('Connected:', health.connected);
console.log('Measured zones:', health.metrics.totalOperations);
console.log('Success rate:', (health.metrics.successRate * 100).toFixed(2), '%');
```

## Анализ измерений

```typescript
const measurements = driver.getMeasurements();

// Найти подозрительные зоны (отклонение > 50 μm)
const suspicious = measurements.filter((m) => {
  const zone = sedanZones.getZone(m.zoneId);
  if (!zone) return false;
  const deviation = Math.abs(m.value - zone.standardThickness.typical);
  return deviation > 50;
});

console.log('Suspicious zones:', suspicious);
```

## Troubleshooting

### Проблема: Устройство не найдено

1. Проверьте включен ли Bluetooth
2. Проверьте права доступа к BLE
3. Убедитесь что устройство включено и заряжено
4. Проверьте правильность имени устройства

### Проблема: Не приходят измерения

1. Убедитесь что устройство в режиме измерения
2. Проверьте подписку на GATT характеристику
3. Проверьте формат парсинга данных
4. Увеличьте таймаут измерения

### Проблема: Разрыв соединения

1. Проверьте расстояние до устройства
2. Проверьте уровень заряда устройства
3. Проверьте помехи от других BLE устройств
4. Используйте retry механизм

## Статус реализации

- [x] Интерфейсы и типы
- [x] База зон кузова
- [x] Фреймворк драйвера
- [x] Логирование и storage
- [x] Health check
- [ ] BLE интеграция (требуется спецификация)
- [ ] Парсинг данных (требуется спецификация)
- [ ] Калибровка (требуется спецификация)

## Контакт производителя

Для получения спецификации обратитесь к производителю толщиномера:

- Запросите GATT профиль (UUID сервисов и характеристик)
- Запросите документацию по протоколу связи
- Запросите примеры кода (если доступны)
- Запросите официальный SDK (если доступен)
