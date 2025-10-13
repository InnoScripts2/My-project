# Common Device Interfaces

Общий функционал для всех устройств киоск-агента.

## Архитектура

Модуль предоставляет базовые интерфейсы, классы ошибок и утилиты для работы с устройствами:

- `interfaces.ts` - Базовые интерфейсы Device, DeviceState, DeviceHealthStatus
- `errors.ts` - Иерархия ошибок для устройств
- `retry.ts` - Retry политика с экспоненциальным backoff и jitter
- `health-check.ts` - Health check механизм
- `logger.ts` - Structured logging для устройств
- `storage.ts` - SQLite storage для состояний и событий устройств

## Использование

### Интерфейс Device

Все устройства должны реализовывать базовый интерфейс:

```typescript
import { Device, DeviceState } from './common/interfaces.js';

class MyDevice extends EventEmitter implements Device {
  async init(config: any): Promise<void> {
    // Инициализация
  }

  async disconnect(): Promise<void> {
    // Отключение
  }

  getState(): DeviceState {
    return DeviceState.CONNECTED;
  }

  getHealthStatus(): DeviceHealthStatus {
    return {
      state: this.getState(),
      connected: true,
      metrics: {
        successRate: 0.95,
        avgResponseTime: 200,
        totalOperations: 100,
        failedOperations: 5,
      },
    };
  }
}
```

### Обработка ошибок

```typescript
import { DeviceConnectionError, DeviceTimeoutError } from './common/errors.js';

try {
  await device.init(config);
} catch (error) {
  if (error instanceof DeviceConnectionError) {
    console.error('Connection failed:', error.message, error.details);
  } else if (error instanceof DeviceTimeoutError) {
    console.error('Timeout:', error.message);
  }
}
```

### Retry политика

```typescript
import { retryWithPolicy, DEFAULT_RETRY_POLICY } from './common/retry.js';

const result = await retryWithPolicy(
  async (attempt) => {
    console.log(`Attempt ${attempt}`);
    return await device.connect();
  },
  DEFAULT_RETRY_POLICY,
  (attempt, delayMs) => console.log(`Starting attempt ${attempt} after ${delayMs}ms`),
  (attempt, error) => console.error(`Attempt ${attempt} failed:`, error)
);
```

### Конфигурация retry через ENV

```bash
DEVICE_RETRY_MAX_ATTEMPTS=5
DEVICE_RETRY_BASE_DELAY_MS=1000
DEVICE_RETRY_MAX_DELAY_MS=30000
DEVICE_RETRY_BACKOFF_MULTIPLIER=2
DEVICE_RETRY_JITTER_FACTOR=0.3
```

### Health check

```typescript
import { BaseHealthChecker } from './common/health-check.js';

const healthChecker = new BaseHealthChecker(
  () => device.getHealthStatus(),
  async () => {
    // Дополнительная проверка
    await device.ping();
    return true;
  }
);

const result = await healthChecker.check();
console.log('Healthy:', result.healthy);
console.log('Status:', result.status);
```

### Логирование

```typescript
import { createLogger } from './common/logger.js';

const logger = createLogger('obd', 'session-123');

logger.debug('Command sent', { command: 'ATZ' });
logger.info('Connected', { port: '/dev/ttyUSB0' });
logger.warn('Slow response', { responseTime: 5000 });
logger.error('Connection lost', { error: 'timeout' });
```

### Storage

```typescript
import { getDeviceStorage } from './common/storage.js';

const storage = getDeviceStorage();

// Сохранить состояние
storage.saveState({
  deviceType: 'obd',
  state: 'connected',
  connected: true,
  lastConnected: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Получить состояние
const state = storage.getState('obd');

// Записать событие
storage.recordEvent({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  deviceType: 'obd',
  eventType: 'connected',
  state: 'connected',
});

// Получить последние события
const events = storage.getRecentEvents('obd', 50);
```

## База данных

SQLite база создаётся автоматически в `storage/devices.sqlite`.

### Таблица device_states

Хранит текущее состояние устройств:

| Поле | Тип | Описание |
|------|-----|----------|
| device_type | TEXT | Тип устройства (obd, thickness) |
| state | TEXT | Текущее состояние |
| connected | INTEGER | Флаг подключения (0/1) |
| last_connected | TEXT | ISO timestamp последнего подключения |
| last_error | TEXT | Последняя ошибка |
| updated_at | TEXT | ISO timestamp обновления |
| metadata | TEXT | JSON с дополнительными данными |

### Таблица device_events

Журнал событий устройств:

| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT | UUID события |
| timestamp | TEXT | ISO timestamp |
| device_type | TEXT | Тип устройства |
| event_type | TEXT | Тип события (connected, disconnected, error, reconnect_attempt) |
| state | TEXT | Состояние после события |
| previous_state | TEXT | Предыдущее состояние |
| error | TEXT | Текст ошибки (если есть) |
| metadata | TEXT | JSON с дополнительными данными |

## Тестирование

Используйте базовые утилиты для unit-тестов:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';

await describe('Device', async () => {
  await it('should connect successfully', async () => {
    const device = new MyDevice();
    await device.init(config);
    assert.strictEqual(device.getState(), DeviceState.CONNECTED);
  });
});
```

## Метрики

Все устройства должны отслеживать метрики:

- `successRate` - Процент успешных операций
- `avgResponseTime` - Среднее время ответа (мс)
- `totalOperations` - Общее количество операций
- `failedOperations` - Количество неудачных операций

## События

Устройства эмитят стандартные события:

- `state_changed` - Изменение состояния
- `connected` - Подключено
- `disconnected` - Отключено
- `error` - Ошибка
- `data` - Получены данные
