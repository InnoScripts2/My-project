# Модуль замков выдачи устройств (LockController)

## Обзор

Модуль `LockController` предоставляет централизованное управление замками для выдачи устройств (толщиномер и OBD-адаптер) в киоске самообслуживания.

## Архитектура

```
┌─────────────────────────────────────┐
│        LockController               │
│  - openSlot(deviceType)             │
│  - closeSlot(deviceType)            │
│  - getStatus(deviceType)            │
│  - getAllStatus()                   │
└──────────────┬──────────────────────┘
               │
               ├──> DeviceDispensePolicy
               │    (валидация условий выдачи)
               │
               └──> Lock (драйверы)
                    ├─ MockLockDriver
                    ├─ SerialRelayLockDriver
                    └─ GpioLockDriver
```

## Компоненты

### LockController

Основной класс для управления замками. Поддерживает:
- Управление несколькими слотами (thickness, obd)
- Таймауты auto-close
- Idempotency ключи для операций
- Логирование через CentralizedLogger (канал 'locks')
- Политики выдачи устройств

### Драйверы замков

#### MockLockDriver
Драйвер для тестов и DEV-режима. Симулирует работу замка без реального оборудования.

Конфигурация:
```typescript
{
  failOnOpen?: boolean;      // Симулировать ошибку при открытии
  failOnClose?: boolean;     // Симулировать ошибку при закрытии
  openDelayMs?: number;      // Задержка при открытии
  closeDelayMs?: number;     // Задержка при закрытии
}
```

#### SerialRelayLockDriver
Драйвер для управления замком через USB-Serial реле.

Конфигурация:
```typescript
{
  port: string;              // Путь к serial-порту (например, '/dev/ttyUSB0')
  baudRate?: number;         // Скорость порта (по умолчанию 9600)
  relayChannel?: number;     // Номер канала реле (по умолчанию 1)
  openCommand?: Buffer;      // Кастомная команда открытия
  closeCommand?: Buffer;     // Кастомная команда закрытия
}
```

Формат команды по умолчанию (для реле на чипе CH340):
```
[0xA0, channel, state, checksum]
где checksum = (0xA0 + channel + state) & 0xFF
```

#### GpioLockDriver
Базовая реализация для управления через GPIO (например, Raspberry Pi).

Конфигурация:
```typescript
{
  pin: number;               // Номер GPIO пина
  activeHigh?: boolean;      // true - активный высокий уровень (по умолчанию)
}
```

**Примечание**: В продакшене потребуется установка библиотеки GPIO (например, `onoff` или `pigpio`).

### Политики выдачи

#### DefaultDeviceDispensePolicy
Политика для PROD/QA режимов:
- **Толщиномер**: выдаётся только после `paymentStatus === 'succeeded'`
- **OBD**: выдаётся только после `vehicleSelected === true`

#### PermissiveDeviceDispensePolicy
Политика для DEV режима: разрешает выдачу без проверок.

## API Endpoints

### POST /api/locks/open

Открывает замок для выдачи устройства.

**Запрос:**
```json
{
  "deviceType": "thickness" | "obd",
  "operationKey": "string (optional)",
  "autoCloseMs": "number (optional)",
  "context": {
    "paymentStatus": "string (для thickness)",
    "vehicleSelected": "boolean (для obd)"
  }
}
```

**Ответ (успех):**
```json
{
  "ok": true,
  "deviceType": "thickness",
  "status": "unlocked"
}
```

**Ответ (блокировка политикой):**
```json
{
  "ok": false,
  "deviceType": "thickness",
  "status": "locked",
  "error": "payment_not_initiated"
}
```

### POST /api/locks/close

Закрывает замок (возврат устройства).

**Запрос:**
```json
{
  "deviceType": "thickness" | "obd",
  "operationKey": "string (optional)",
  "reason": "string (optional)"
}
```

**Ответ:**
```json
{
  "ok": true,
  "deviceType": "thickness",
  "status": "locked"
}
```

### GET /api/locks/status

Получает статус замков.

**Параметры:**
- `deviceType` (optional) - получить статус конкретного замка

**Ответ (все замки):**
```json
{
  "ok": true,
  "statuses": {
    "thickness": {
      "deviceType": "thickness",
      "status": "locked",
      "locked": true,
      "autoCloseScheduled": false,
      "lastActionAt": "2025-10-04T03:30:00.000Z"
    },
    "obd": { ... }
  }
}
```

**Ответ (конкретный замок):**
```json
{
  "ok": true,
  "status": {
    "deviceType": "thickness",
    "status": "locked",
    "locked": true,
    "autoCloseScheduled": false,
    "lastActionAt": "2025-10-04T03:30:00.000Z"
  }
}
```

## Конфигурация

### Переменные окружения

#### LOCK_CONFIGS
JSON-массив конфигураций замков.

**Пример для DEV (mock-замки):**
```bash
LOCK_CONFIGS='[
  {"deviceType":"thickness","driverType":"mock","autoCloseMs":30000},
  {"deviceType":"obd","driverType":"mock","autoCloseMs":30000}
]'
```

**Пример для PROD (serial-реле):**
```bash
LOCK_CONFIGS='[
  {
    "deviceType":"thickness",
    "driverType":"serial-relay",
    "autoCloseMs":30000,
    "driverConfig":{"port":"/dev/ttyUSB0","baudRate":9600,"relayChannel":1}
  },
  {
    "deviceType":"obd",
    "driverType":"serial-relay",
    "autoCloseMs":30000,
    "driverConfig":{"port":"/dev/ttyUSB0","baudRate":9600,"relayChannel":2}
  }
]'
```

**Пример для GPIO:**
```bash
LOCK_CONFIGS='[
  {
    "deviceType":"thickness",
    "driverType":"gpio",
    "autoCloseMs":30000,
    "driverConfig":{"pin":17,"activeHigh":true}
  },
  {
    "deviceType":"obd",
    "driverType":"gpio",
    "autoCloseMs":30000,
    "driverConfig":{"pin":18,"activeHigh":true}
  }
]'
```

#### AGENT_ENV
Режим работы агента: `DEV`, `QA` или `PROD`.
- `DEV` - используется PermissiveDeviceDispensePolicy
- `QA`, `PROD` - используется DefaultDeviceDispensePolicy

## Использование в коде

```typescript
import { LockController, DefaultDeviceDispensePolicy } from './locks/index.js';

// Создание контроллера
const configs = [
  { deviceType: 'thickness', driverType: 'mock', autoCloseMs: 30000 },
  { deviceType: 'obd', driverType: 'mock', autoCloseMs: 30000 },
];
const policy = new DefaultDeviceDispensePolicy();
const controller = new LockController(configs, policy);

// Открытие замка
const result = await controller.openSlot('thickness', {
  operationKey: 'payment-123',
  context: { paymentStatus: 'succeeded' },
  autoCloseMs: 30000,
});

if (result.ok) {
  console.log('Замок открыт');
}

// Получение статуса
const status = await controller.getStatus('thickness');
console.log('Статус замка:', status);

// Закрытие замка
await controller.closeSlot('thickness', {
  reason: 'manual_close',
});

// Очистка ресурсов
await controller.cleanup();
```

## Логирование

Все операции логируются через CentralizedLogger в канал `'locks'`:

```typescript
// Примеры логов
[INFO] [locks] Инициализирован замок для thickness { driverType: 'mock' }
[INFO] [locks] Замок thickness открыт { operationKey: 'payment-123' }
[WARN] [locks] Выдача thickness заблокирована: payment_status_pending
[ERROR] [locks] Ошибка открытия замка thickness
[INFO] [locks] Замок thickness закрыт { reason: 'auto_close' }
```

## Безопасность

### Idempotency
Операции `openSlot` и `closeSlot` поддерживают idempotency через `operationKey`. Повторные запросы с тем же ключом не выполняют действие повторно, а возвращают текущий статус.

### Auto-close
Все замки автоматически закрываются через заданный таймаут (по умолчанию 30 секунд) для предотвращения несанкционированного доступа.

### Политики выдачи
В продакшене устройства выдаются только при выполнении строгих условий:
- Толщиномер: только после подтверждённой оплаты
- OBD: только после выбора автомобиля

## Тестирование

Модуль полностью покрыт unit-тестами:

```bash
npm test src/locks/LockController.test.ts
```

Тесты покрывают:
- ✅ Инициализацию контроллера
- ✅ Операции открытия/закрытия замков
- ✅ Idempotency ключи
- ✅ Auto-close таймауты
- ✅ Политики выдачи
- ✅ Edge-cases (ошибки драйверов, несуществующие замки)

## Будущие улучшения

- [ ] Поддержка дополнительных типов замков (электромагнитные, RFID)
- [ ] Интеграция с камерой безопасности для записи выдачи
- [ ] Мониторинг состояния замков через датчики
- [ ] Алерты при аномальном поведении (слишком частые открытия)
- [ ] Поддержка залога для OBD-устройств
