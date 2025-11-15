# Часть 1: Анализ Node.js проектов - Детали

## node-bluetooth-obd-master: Полная спецификация

### Файловая структура

```
node-bluetooth-obd-master/
├── lib/
│   ├── obd.js (13,946 bytes)      # Главный драйвер
│   └── obdInfo.js (29,829 bytes)  # PID база данных
├── test/
│   ├── obd.spec.js (9,005 bytes)  # Тесты
│   └── test.js (1,516 bytes)      # Примеры
├── package.json (737 bytes)
├── README.md (4,729 bytes)
├── LICENSE (611 bytes)
├── NOTICE (273 bytes)
├── .gitignore (332 bytes)
└── .npmignore (78 bytes)

ИТОГО: 10 файлов, ~60 KB
```

### Детальный разбор зависимостей

#### bluetooth-serial-port@2.2.7

**Что это:**
Модуль для работы с Bluetooth Serial Port (RFCOMM) на Node.js

**Проблемы:**
1. Требует нативной компиляции (node-gyp)
2. Зависит от libbluetooth-dev (Linux)
3. Может не работать на Windows без дополнительной настройки
4. Последний релиз 2020 года (устаревший)

**Альтернативы для kiosk-agent:**

**Вариант 1: @serialport/bindings-cpp** (рекомендуется)
```json
{
  "dependencies": {
    "@serialport/bindings-cpp": "^12.0.0",
    "serialport": "^12.0.0"
  }
}
```

Преимущества:
- Активная поддержка
- Кроссплатформенность (Windows/Linux/macOS)
- Документация актуальная
- Поддержка USB/Serial/Bluetooth

**Вариант 2: node-bluetooth** (только Linux)
```json
{
  "dependencies": {
    "node-bluetooth": "^1.3.0"
  }
}
```

**Вариант 3: @abandonware/bluetooth-serial-port** (форк)
```json
{
  "dependencies": {
    "@abandonware/bluetooth-serial-port": "^2.2.7"
  }
}
```

### API Reference (извлечено из README)

#### Класс OBDReader

**Constructor:**
```javascript
const OBDReader = require('bluetooth-obd');
const btOBDReader = new OBDReader();
```

**События:**

1. `connected`
   - Когда: Порт открыт, готов к работе
   - Параметры: нет
   - Пример: `btOBDReader.on('connected', () => { /* start polling */ })`

2. `dataReceived`
   - Когда: Получены и распарсены данные с OBD
   - Параметры: `data` (объект)
   - Структура data: `{ value, name?, mode?, pid?, unit?, timestamp? }`

3. `error`
   - Когда: Ошибка подключения/чтения
   - Параметры: `message` (string)

4. `debug`
   - Когда: Отладочная информация
   - Параметры: `message` (string)

**Методы подключения:**

```javascript
// Автопоиск устройства по имени
autoconnect(query?: string): void

// Прямое подключение
connect(address: string, channel: number): void

// Отключение
disconnect(): void
```

**Методы чтения данных:**

```javascript
// Разовый запрос значения
requestValueByName(name: string): void

// Добавить PID в список опроса
addPoller(name: string): void

// Удалить PID из списка опроса
removePoller(name: string): void

// Удалить все pollers
removeAllPollers(): void

// Опросить все активные pollers
writePollers(): void

// Начать автоматический опрос
startPolling(interval?: number): void

// Остановить опрос
stopPolling(): void
```

**Методы работы с PID:**

```javascript
// Получить hex код PID по имени
getPIDByName(name: string): string

// Распарсить ответ OBD в объект
parseOBDCommand(hexString: string): {
  value: string | number,
  name?: string,
  mode?: string,
  pid?: string
}
```

**Низкоуровневый доступ:**

```javascript
// Отправить команду напрямую
write(message: string, replies?: number): void
```

### Поддерживаемые PIDs (из README)

| Имя | Описание | Единица измерения |
|-----|----------|-------------------|
| `vss` | Vehicle Speed Sensor | km/h |
| `rpm` | Engine RPM | об/мин |
| `temp` | Coolant Temperature | °C |
| `load_pct` | Engine Load Percentage | % |
| `map` | Manifold Absolute Pressure | kPa |
| `frp` | Fuel Rail Pressure | kPa |

**Примечание:** Это только примеры из документации. Полный список PIDs находится в `obdInfo.js`.

### Примеры использования

#### Пример 1: Базовое чтение

```javascript
const OBDReader = require('bluetooth-obd');
const reader = new OBDReader();

reader.on('connected', () => {
  console.log('Connected to OBD-II adapter');
  reader.requestValueByName('rpm');
});

reader.on('dataReceived', (data) => {
  console.log(`${data.name}: ${data.value}`);
  // Вывод: rpm: 2500
});

reader.on('error', (err) => {
  console.error('Error:', err);
});

reader.autoconnect('obd');
```

#### Пример 2: Continuous Polling

```javascript
const reader = new OBDReader();

reader.on('connected', () => {
  // Добавить несколько параметров
  reader.addPoller('vss');
  reader.addPoller('rpm');
  reader.addPoller('temp');

  // Опрашивать каждую секунду
  reader.startPolling(1000);
});

reader.on('dataReceived', (data) => {
  console.log(`[${new Date().toISOString()}] ${data.name}: ${data.value}`);
  // [2025-10-06T12:00:00.000Z] vss: 60
  // [2025-10-06T12:00:00.100Z] rpm: 2500
  // [2025-10-06T12:00:00.200Z] temp: 85
});

reader.autoconnect('ELM327');
```

#### Пример 3: Интеграция с нашим kiosk-agent

```typescript
// apps/kiosk-agent/src/devices/obd/drivers/BluetoothObdDriver.ts
import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { PidDatabase } from '../database/PidDatabase';

export class BluetoothObdDriver extends EventEmitter {
  private port: SerialPort | null = null;
  private pollers: Set<string> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private pidDb: PidDatabase;

  constructor() {
    super();
    this.pidDb = new PidDatabase();
  }

  async connect(portPath: string): Promise<void> {
    this.port = new SerialPort({
      path: portPath,
      baudRate: 38400, // ELM327 default
    });

    this.port.on('open', () => {
      this.emit('connected');
    });

    this.port.on('error', (err) => {
      this.emit('error', err.message);
    });
  }

  addPoller(pidName: string): void {
    const pid = this.pidDb.getPidByName(pidName);
    if (pid) {
      this.pollers.add(pidName);
    }
  }

  startPolling(interval: number = 1000): void {
    this.pollingInterval = setInterval(() => {
      for (const pidName of this.pollers) {
        this.requestValueByName(pidName);
      }
    }, interval);
  }

  // ... остальные методы
}
```

### Тестовое покрытие (из obd.spec.js)

**Что тестируется:**

1. Parsing hex responses
2. PID lookup by name
3. Connection handling
4. Error scenarios
5. Polling mechanism
6. Event emission

**Пример теста:**
```javascript
describe('OBDReader', () => {
  it('should parse RPM correctly', () => {
    const reader = new OBDReader();
    const result = reader.parseOBDCommand('410C1AF8');
    expect(result.name).toBe('rpm');
    expect(result.value).toBe(1726); // (0x1AF8 / 4)
  });
});
```

### Миграция на TypeScript

#### Шаг 1: Типы для PID

```typescript
// apps/kiosk-agent/src/devices/obd/types/Pid.ts

export interface Pid {
  name: string;
  mode: string;
  pid: string;
  description: string;
  min: number;
  max: number;
  unit: string;
  bytes: 1 | 2 | 4;
  convertToUseful: ConversionFunction;
}

export type ConversionFunction = (
  byteA: number,
  byteB?: number,
  byteC?: number,
  byteD?: number
) => number;

export interface PidResponse {
  value: number | string;
  name?: string;
  mode?: string;
  pid?: string;
  unit?: string;
  timestamp: number;
}
```

#### Шаг 2: Интерфейс драйвера

```typescript
// apps/kiosk-agent/src/devices/obd/types/Driver.ts

export interface OBDDriver extends EventEmitter {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  requestValue(pidName: string): Promise<PidResponse>;
  addPoller(pidName: string): void;
  removePoller(pidName: string): void;
  startPolling(interval: number): void;
  stopPolling(): void;
}

export interface ConnectionConfig {
  type: 'bluetooth' | 'usb' | 'serial';
  address?: string; // Bluetooth address
  port?: string;    // COM port
  baudRate?: number;
}
```

### Roadmap интеграции

#### Week 1: Подготовка

**День 1-2:**
- [ ] Извлечь obdInfo.js
- [ ] Создать TypeScript типы
- [ ] Настроить тестовое окружение

**День 3-4:**
- [ ] Конвертировать PID базу в TypeScript
- [ ] Создать PidDatabase класс
- [ ] Юнит-тесты для PidDatabase

**День 5:**
- [ ] Документация API
- [ ] Code review
- [ ] Merge в main

#### Week 2: Драйвер

**День 1-2:**
- [ ] Портировать OBDReader в BluetoothObdDriver
- [ ] Заменить зависимости (serialport)
- [ ] Базовые методы (connect, disconnect, read)

**День 3-4:**
- [ ] Polling система
- [ ] Error handling
- [ ] Reconnection logic

**День 5:**
- [ ] Интеграция с ObdConnectionManager
- [ ] Интеграционные тесты
- [ ] Merge в main

#### Week 3: Финализация

**День 1-2:**
- [ ] Тесты с реальным ELM327
- [ ] Performance tuning
- [ ] Memory leak checks

**День 3-4:**
- [ ] Prometheus metrics
- [ ] Logging
- [ ] Error reporting

**День 5:**
- [ ] Документация
- [ ] Release notes
- [ ] Deploy в DEV

---

## Следующий проект: node-obd2-master

Анализ отложен до Части 2 (395 файлов требуют отдельного рассмотрения).

**Вопросы для анализа:**
1. Чем отличается от node-bluetooth-obd?
2. Поддерживает ли больше PIDs?
3. Есть ли Mode 03/04/09?
4. Качество кода и тестов?
5. Активность разработки?

