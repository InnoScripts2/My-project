# OBD-II Driver Module

Полноценный модуль для работы с OBD-II адаптерами через протокол ELM327.

## Архитектура

```
obd/
  Elm327Driver.ts         - Основной драйвер ELM327
  commands/
    index.ts              - Команды ELM327 (AT, режимы 01-09)
  database/
    DtcDatabase.ts        - База кодов DTC (ISO 15031, SAE J2012)
    PidDatabase.ts        - База PIDs (SAE J1979)
  driver/
    DeviceObd.ts          - Интерфейс DeviceObd
  types/
    ObdTypes.ts           - Типы данных OBD-II
```

## Спецификации и стандарты

Реализация основана на следующих открытых стандартах:

- **ELM327 Data Sheet** - Протокол AT команд ELM327
- **SAE J1979** - E/E Diagnostic Test Modes (PIDs)
- **SAE J2012** - Diagnostic Trouble Code Definitions
- **ISO 15031** - Communication between vehicle and external equipment
- **ISO 14230** - Keyword Protocol 2000 (KWP2000)
- **ISO 9141** - Road vehicles diagnostic systems

## Использование

### Базовый пример

```typescript
import { Elm327Driver } from './devices/obd/Elm327Driver.js';
import { ObdConfig } from './devices/obd/driver/DeviceObd.js';

const driver = new Elm327Driver();

const config: ObdConfig = {
  transport: 'serial',
  port: '/dev/ttyUSB0',
  baudRate: 38400,
  timeout: 5000,
  retries: 3,
};

// Инициализация
await driver.init(config);

// Чтение DTC кодов
const dtcCodes = await driver.readDtc();
console.log('DTC codes:', dtcCodes);

// Чтение PID
const rpm = await driver.readPid('rpm');
console.log('Engine RPM:', rpm.value, rpm.unit);

// Очистка DTC кодов
const cleared = await driver.clearDtc();
console.log('DTCs cleared:', cleared);

// Отключение
await driver.disconnect();
```

### События

```typescript
driver.on('state_changed', (newState) => {
  console.log('State changed:', newState);
});

driver.on('connected', () => {
  console.log('Connected to OBD adapter');
});

driver.on('disconnected', () => {
  console.log('Disconnected from OBD adapter');
});

driver.on('error', (error) => {
  console.error('OBD error:', error);
});
```

### Health check

```typescript
const health = driver.getHealthStatus();
console.log('Connected:', health.connected);
console.log('Success rate:', health.metrics.successRate);
console.log('Avg response time:', health.metrics.avgResponseTime, 'ms');
```

## Команды

### Инициализация

Последовательность инициализации ELM327:

1. `ATZ` - Reset
2. `ATE0` - Echo off
3. `ATL0` - Linefeeds off
4. `ATS0` - Spaces off
5. `ATH0` - Headers off
6. `ATSP0` - Auto protocol

### Диагностические команды

- `03` - Read DTC (Mode 03)
- `04` - Clear DTC (Mode 04)
- `07` - Read Pending DTC (Mode 07)
- `0101` - Read MIL status (Mode 01 PID 01)

### PIDs

Поддерживаются стандартные PIDs Mode 01:

- `010C` - Engine RPM
- `010D` - Vehicle Speed
- `0105` - Engine Coolant Temperature
- `0104` - Engine Load
- `0111` - Throttle Position
- `010F` - Intake Air Temperature
- `0110` - Mass Air Flow
- И другие (см. PidDatabase.ts)

## База данных DTC

База содержит стандартные коды из открытых источников:

### P-коды (Powertrain)

- P0100-P01FF: Fuel and Air Metering
- P0200-P02FF: Fuel and Air Metering (Injector Circuit)
- P0300-P03FF: Ignition System or Misfire
- P0400-P04FF: Auxiliary Emission Controls
- P0500-P05FF: Vehicle Speed Controls and Idle Control

### C-коды (Chassis)

- C1200-C12FF: ABS System

### B-коды (Body)

- B1000-B10FF: Body Control Module

### U-коды (Network)

- U0100-U01FF: Communication Network

## Обработка ошибок

```typescript
import {
  DeviceConnectionError,
  DeviceTimeoutError,
  DeviceProtocolError,
} from '../common/errors.js';

try {
  await driver.init(config);
} catch (error) {
  if (error instanceof DeviceConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof DeviceTimeoutError) {
    console.error('Operation timed out:', error.message);
  } else if (error instanceof DeviceProtocolError) {
    console.error('Protocol error:', error.message);
  }
}
```

## Retry политика

Автоматические повторы при сбоях:

- Максимум попыток: 3 (по умолчанию)
- Базовая задержка: 1000ms
- Максимальная задержка: 10000ms
- Backoff multiplier: 2
- Jitter factor: 0.2

Конфигурация через ENV:

```bash
DEVICE_RETRY_MAX_ATTEMPTS=5
DEVICE_RETRY_BASE_DELAY_MS=1000
DEVICE_RETRY_MAX_DELAY_MS=30000
DEVICE_RETRY_BACKOFF_MULTIPLIER=2
DEVICE_RETRY_JITTER_FACTOR=0.3
```

## Логирование

Все операции логируются в structured формате:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "[Elm327Driver] Connected to OBD adapter",
  "context": {
    "protocol": "ISO 15765-4 CAN"
  }
}
```

## Storage

Состояния и события сохраняются в SQLite (`storage/devices.sqlite`):

```typescript
// Получить текущее состояние
const state = storage.getState('obd');

// Получить последние события
const events = storage.getRecentEvents('obd', 100);
```

## Тестирование

### Unit тесты

```bash
npm --prefix apps/kiosk-agent test
```

### Интеграционные тесты

Для интеграционных тестов требуется реальный OBD-II адаптер:

```bash
AGENT_ENV=DEV npm --prefix apps/kiosk-agent run self-check:obd
```

## Расшифровка DTC кодов

```typescript
import { dtcDatabase } from './database/DtcDatabase.js';

const dtcInfo = dtcDatabase.getDtcInfo('P0171');
console.log('Code:', dtcInfo.code);
console.log('Description:', dtcInfo.description);
console.log('Severity:', dtcInfo.severity);
console.log('System:', dtcInfo.system);
```

## Расшифровка PIDs

```typescript
import { pidDatabase } from './database/PidDatabase.js';

const pidInfo = pidDatabase.getPidByName('rpm');
console.log('PID:', pidInfo.pid);
console.log('Unit:', pidInfo.unit);
console.log('Range:', pidInfo.min, '-', pidInfo.max);
```

## Метрики

```typescript
const health = driver.getHealthStatus();
console.log('Total operations:', health.metrics.totalOperations);
console.log('Failed operations:', health.metrics.failedOperations);
console.log('Success rate:', (health.metrics.successRate * 100).toFixed(2), '%');
console.log('Avg response time:', health.metrics.avgResponseTime.toFixed(2), 'ms');
```

## Troubleshooting

### Connection Issues

#### Problem: Cannot connect to adapter

**Symptoms:**
- `UNABLE TO CONNECT` error
- Timeout on initialization
- No response from adapter

**Solutions:**

1. **Check COM port availability (Windows)**
   ```bash
   # List available ports
   npm --prefix apps/kiosk-agent run list-ports
   
   # Typical ports: COM3, COM4, COM5
   # Configure via AGENT_OBD_PORT environment variable
   ```

2. **Check serial device (Linux/macOS)**
   ```bash
   # Linux
   ls /dev/ttyUSB*
   ls /dev/ttyACM*
   
   # macOS
   ls /dev/cu.*
   ls /dev/tty.*
   
   # Check permissions
   sudo chmod 666 /dev/ttyUSB0
   
   # Add user to dialout group (Linux)
   sudo usermod -a -G dialout $USER
   ```

3. **Verify baud rate**
   - Most ELM327 adapters: 38400 baud
   - Some cheaper clones: 9600 baud
   - Try both if unsure

4. **USB re-enumeration**
   - Unplug and replug USB adapter
   - Wait 5 seconds between unplug/replug
   - Check Device Manager (Windows) or `dmesg` (Linux)

5. **Driver issues (Windows)**
   - Install CH340/CH341 drivers for Chinese clones
   - Install FTDI drivers for genuine adapters
   - Check driver signature enforcement

#### Problem: Adapter connects but no vehicle response

**Symptoms:**
- Init sequence completes successfully
- `NO DATA` on OBD commands
- `SEARCHING...` followed by timeout

**Solutions:**

1. **Check vehicle connection**
   - Ensure OBD-II port is accessible (usually under dashboard)
   - Verify adapter is fully inserted
   - Check for bent pins

2. **Verify ignition state**
   - Turn ignition to ON position (engine can be off)
   - Some vehicles require engine running
   - Wait 10 seconds after turning ignition on

3. **Protocol compatibility**
   - Check vehicle year: OBD-II mandated for 1996+ (US), 2001+ (EU)
   - Try manual protocol selection:
     ```typescript
     // In config
     config.protocol = '6';  // ISO 15765-4 CAN (most common)
     config.protocol = '7';  // ISO 15765-4 CAN (extended)
     config.protocol = '3';  // ISO 9141-2 (older vehicles)
     ```

4. **Adapter quality issues**
   - Some cheap ELM327 clones use fake chips
   - Test with known-good vehicle first
   - Consider genuine adapter for production

### Command Timeout Issues

#### Problem: Commands timeout intermittently

**Symptoms:**
- Some commands succeed, others timeout
- Inconsistent response times
- Works initially, then fails

**Solutions:**

1. **Increase timeout values**
   ```typescript
   config.commandTimeout = 5000;  // 5 seconds
   config.initTimeout = 10000;    // 10 seconds
   ```

2. **Check bus load**
   - High CAN bus traffic can cause delays
   - Modern vehicles have many ECUs competing for bandwidth
   - Some commands inherently slower (e.g., VIN read)

3. **Reduce request rate**
   - Don't poll too frequently (max 10 Hz)
   - Add delays between rapid successive commands
   - Implement adaptive rate limiting

4. **Vehicle-specific quirks**
   - Some ECUs slow to respond to certain PIDs
   - Try disabling headers: `ATH0`
   - Enable adaptive timing: `ATAT1`

### Data Quality Issues

#### Problem: Incorrect or garbled data

**Symptoms:**
- Invalid DTC codes
- Out-of-range PID values
- Checksum errors

**Solutions:**

1. **Protocol verification**
   ```bash
   # Check active protocol
   ATDPN
   
   # Expected responses:
   # 0 = Auto
   # 6 = ISO 15765-4 CAN (11 bit, 500 kbaud)
   # 7 = ISO 15765-4 CAN (29 bit, 500 kbaud)
   # 8 = ISO 15765-4 CAN (11 bit, 250 kbaud)
   # 9 = ISO 15765-4 CAN (29 bit, 250 kbaud)
   ```

2. **Data validation**
   - Implement range checks on parsed values
   - Detect and filter duplicate responses
   - Handle multi-line responses properly

3. **Noise filtering**
   - Check cable quality
   - Avoid USB hub connections
   - Keep cable away from interference sources

4. **Adapter firmware**
   - Some clones have buggy firmware
   - Check for firmware updates
   - Consider replacing adapter

### Windows-Specific Issues

#### Problem: COM port changes after reboot

**Symptoms:**
- Works after initial setup
- Fails after Windows reboot
- COM port number different

**Solutions:**

1. **Fix COM port assignment**
   - Device Manager → Ports → Properties → Port Settings → Advanced
   - Set specific COM port number
   - Restart required

2. **Use port auto-detection**
   ```typescript
   // Don't hardcode port, use detection
   const ports = await SerialPort.list();
   const obdPort = ports.find(p => 
     p.manufacturer?.includes('Silicon Labs') ||
     p.manufacturer?.includes('FTDI')
   );
   ```

3. **Handle re-enumeration**
   - Implement USB device arrival/removal events
   - Auto-reconnect on port change
   - Store device by VID/PID not port number

#### Problem: Access denied on COM port

**Symptoms:**
- Port appears in list
- Cannot open port
- "Access is denied" error

**Solutions:**

1. **Check for competing applications**
   - Close other serial terminal programs
   - Check Task Manager for hidden processes
   - Reboot if necessary

2. **Run with elevated privileges**
   - Right-click → Run as Administrator
   - Add UAC manifest to application

3. **Check antivirus/security software**
   - May block serial port access
   - Add exception for application

### Performance Optimization

#### Problem: Slow response times

**Solutions:**

1. **Optimize init sequence**
   - Disable unnecessary echo/headers early
   - Use spaces off: `ATS0`
   - Skip memory: `ATM0`

2. **Batch PID requests**
   - Some adapters support multi-PID requests
   - Example: `01 0C 0D 05` (RPM, Speed, Temp in one command)

3. **Cache supported PIDs**
   - Query PID support once: `0100`, `0120`, `0140`
   - Store results, don't re-query
   - Skip unsupported PIDs

4. **Use faster baud rate**
   - Some adapters support 115200 or 230400 baud
   - Configure with `ATBR` commands
   - Test stability at higher rates

### Production Deployment Checklist

- [ ] Use genuine or verified-compatible ELM327 adapter
- [ ] Implement automatic port detection and re-enumeration
- [ ] Set appropriate timeouts for target vehicles
- [ ] Cache protocol and supported PIDs
- [ ] Implement retry logic with exponential backoff
- [ ] Log all errors with context for debugging
- [ ] Monitor connection stability metrics
- [ ] Implement watchdog for hung connections
- [ ] Test with multiple vehicle makes/models
- [ ] Handle graceful degradation on failures
- [ ] Document vehicle-specific quirks
- [ ] Prepare fallback modes (reduced functionality)

## Dev режим

В DEV режиме доступны дополнительные возможности:

```typescript
if (process.env.AGENT_ENV === 'DEV') {
  // Debug логирование включено автоматически
  // Можно использовать моки для тестирования
}
```

## Поддерживаемые транспорты

- [x] Serial (USB, RS232)
- [ ] Bluetooth Classic (планируется)
- [ ] Bluetooth Low Energy (планируется)
- [ ] WiFi (планируется)

## Ссылки

- [ELM327 Data Sheet](https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327DS.pdf)
- [SAE J1979 Standard](https://www.sae.org/standards/content/j1979_201202/)
- [OBD-II PIDs Wikipedia](https://en.wikipedia.org/wiki/OBD-II_PIDs)
- [ISO 15031 Standard](https://www.iso.org/standard/66369.html)
