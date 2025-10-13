# ELM327 OBD-II Driver

Low-level driver implementation for ELM327 OBD-II adapters with Serial and Bluetooth transport support.

## Features

- Full ELM327 protocol implementation
- Command queue with priority support
- Automatic retry with exponential backoff
- Reconnection logic with configurable attempts
- Comprehensive event system
- Status management
- DTC reading and clearing (Mode 03/04)
- PID reading (Mode 01) with 50+ supported parameters
- Structured logging (JSON format)
- Prometheus metrics support
- Type-safe TypeScript implementation

## Architecture

```
┌─────────────────────────────────────────┐
│         Application Layer                │
│   (REST API, WebSocket, CLI, etc.)      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          Elm327Driver                    │
│   (DeviceObd implementation)             │
│   - Command queue                        │
│   - Retry logic                          │
│   - Event emission                       │
│   - Status management                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          Transport Layer                 │
│   - SerialPortTransport                  │
│   - BluetoothTransport (planned)         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│        Physical OBD-II Adapter           │
│          (ELM327 device)                 │
└─────────────────────────────────────────┘
```

## Installation

```bash
npm install
```

## Usage

### Basic Example

```typescript
import { Elm327Driver } from './devices/obd/driver/Elm327Driver.js';

const driver = new Elm327Driver();

driver.on('connected', () => {
  console.log('OBD adapter connected');
});

driver.on('error', (error) => {
  console.error('OBD error:', error);
});

await driver.init({
  transport: 'serial',
  port: 'COM3', // or '/dev/ttyUSB0' on Linux
  baudRate: 38400,
  timeout: 5000,
  retries: 3,
});

const dtcList = await driver.readDtc();
console.log('DTC codes:', dtcList);

await driver.disconnect();
```

### Reading PIDs

```typescript
await driver.init({ transport: 'serial', port: 'COM3' });

const rpm = await driver.readPid('0C');
console.log(`RPM: ${rpm.value} ${rpm.unit}`);

const speed = await driver.readPid('0D');
console.log(`Speed: ${speed.value} ${speed.unit}`);

const coolantTemp = await driver.readPid('05');
console.log(`Coolant: ${coolantTemp.value} ${coolantTemp.unit}`);
```

### Clearing DTCs

```typescript
await driver.init({ transport: 'serial', port: 'COM3' });

const userConfirmed = true; // Get confirmation from user

if (userConfirmed) {
  const success = await driver.clearDtc();
  console.log(success ? 'DTCs cleared' : 'Failed to clear DTCs');
}
```

### Event Handling

```typescript
driver.on('connected', () => {
  console.log('Connected to OBD adapter');
});

driver.on('disconnected', () => {
  console.log('Disconnected from OBD adapter');
});

driver.on('status-change', (status) => {
  console.log('Status:', status);
});

driver.on('dtc-read', (dtcs) => {
  console.log('DTCs read:', dtcs);
});

driver.on('dtc-cleared', (success) => {
  console.log('DTCs cleared:', success);
});

driver.on('pid-read', (value) => {
  console.log('PID value:', value);
});

driver.on('error', (error) => {
  console.error('Error:', error);
});

driver.on('timeout', (command) => {
  console.warn('Command timeout:', command);
});
```

### Periodic PID Polling

```typescript
await driver.init({ transport: 'serial', port: 'COM3' });

const pollInterval = setInterval(async () => {
  try {
    const rpm = await driver.readPid('0C');
    const speed = await driver.readPid('0D');
    console.log(`RPM: ${rpm.value}, Speed: ${speed.value}`);
  } catch (error) {
    console.error('Polling error:', error);
  }
}, 1000);

// Stop polling after 60 seconds
setTimeout(() => {
  clearInterval(pollInterval);
  driver.disconnect();
}, 60000);
```

## Configuration

```typescript
interface ObdConfig {
  transport: 'serial' | 'bluetooth';
  port: string;
  baudRate?: number; // default: 38400
  timeout?: number; // default: 5000ms
  retries?: number; // default: 3
  reconnectDelay?: number; // default: 5000ms
  reconnectAttempts?: number; // default: 3
  pidPollRate?: number; // default: 1000ms
}
```

## Status Values

- `DISCONNECTED` - Not connected
- `CONNECTING` - Connection in progress
- `INITIALIZING` - Sending initialization commands
- `READY` - Ready for commands
- `SCANNING` - Reading DTC or PIDs
- `IDLE` - Connected but not actively scanning
- `ERROR` - Error occurred
- `UNAVAILABLE` - Connection lost and reconnection failed

## Commands

### AT Commands

- `ATZ` - Reset adapter (timeout: 1000ms)
- `ATE0` - Echo off (timeout: 1000ms)
- `ATL0` - Linefeeds off (timeout: 1000ms)
- `ATS0` - Spaces off (timeout: 1000ms)
- `ATH0` - Headers off (timeout: 1000ms)
- `ATSP0` - Auto protocol selection (timeout: 1000ms)

### OBD Modes

- Mode 01 - Current data (timeout: 5000ms)
  - `0100` - Supported PIDs 01-20
  - `01XX` - Read specific PID
- Mode 03 - Read DTCs (timeout: 5000ms)
  - `03` - Read stored DTCs
- Mode 04 - Clear DTCs (timeout: 5000ms)
  - `04` - Clear all DTCs

## Supported PIDs

| PID | Name                        | Unit    | Formula              |
| --- | --------------------------- | ------- | -------------------- |
| 0C  | Engine RPM                  | rpm     | ((A\*256)+B)/4       |
| 0D  | Vehicle Speed               | km/h    | A                    |
| 05  | Engine Coolant Temperature  | °C      | A-40                 |
| 0F  | Intake Air Temperature      | °C      | A-40                 |
| 11  | Throttle Position           | %       | A\*100/255           |
| 42  | Control Module Voltage      | V       | ((A\*256)+B)/1000    |
| 04  | Calculated Engine Load      | %       | A\*100/255           |
| 0A  | Fuel Pressure               | kPa     | A\*3                 |
| 10  | MAF Air Flow Rate           | g/s     | ((A\*256)+B)/100     |
| ... | (50+ PIDs supported)        |         | See PidDatabase.ts   |

## DTC Categories

- **P-codes** (Powertrain) - Engine and transmission
- **C-codes** (Chassis) - ABS, suspension, steering
- **B-codes** (Body) - Airbags, climate control
- **U-codes** (Network) - CAN bus, communication

## Error Handling

```typescript
import {
  ObdConnectionError,
  ObdTimeoutError,
  ObdParseError,
  ObdUnsupportedError,
} from './devices/obd/driver/errors.js';

try {
  await driver.init({ transport: 'serial', port: 'COM3' });
} catch (error) {
  if (error instanceof ObdConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof ObdTimeoutError) {
    console.error('Timeout:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Retry Logic

Commands are automatically retried with exponential backoff:

1. First attempt: immediate
2. Second attempt: 500ms delay
3. Third attempt: 1000ms delay
4. Fourth attempt: 2000ms delay

After exhausting retries, an error is thrown.

## Reconnection

If the connection is lost, the driver attempts to reconnect:

1. First attempt: 5s delay
2. Second attempt: 10s delay
3. Third attempt: 20s delay

After 3 failed attempts, status changes to `UNAVAILABLE`.

## Logging

All logs are in structured JSON format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Adapter initialized",
  "context": {
    "supportedPids": ["0C", "0D", "05"]
  }
}
```

## Metrics

Access metrics via `getMetrics()`:

```typescript
const metrics = driver.getMetrics();
console.log(metrics);
/*
{
  totalCommands: 150,
  successfulCommands: 148,
  failedCommands: 2,
  timeouts: 1,
  averageLatencyMs: 120,
  lastCommand: "010C",
  lastDurationMs: 115,
  lastError: undefined,
  lastUpdatedAt: "2024-01-01T12:00:00.000Z"
}
*/
```

### Prometheus Metrics

Export metrics for monitoring with Prometheus:

```typescript
import { createObdPrometheusCollector } from './devices/obd/driver/prometheus.js';
import { Registry } from 'prom-client';

const driver = new Elm327Driver();
await driver.init({ transport: 'serial', port: 'COM3' });

const register = new Registry();
const collector = createObdPrometheusCollector(driver, { register });

setInterval(() => {
  collector.update();
}, 5000);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

Available Prometheus metrics:

- `obd_connections_total` - Total connection attempts (Counter)
- `obd_dtc_read_total` - Total DTC read operations (Counter)
- `obd_dtc_cleared_total` - Total DTC clear operations (Counter)
- `obd_pid_read_total{pid}` - Total PID reads by PID (Counter)
- `obd_errors_total{type}` - Total errors by type (Counter)
- `obd_command_duration_seconds{command}` - Command duration histogram (Histogram)
- `obd_total_commands` - Total commands sent (Gauge)
- `obd_successful_commands` - Successful commands (Gauge)
- `obd_failed_commands` - Failed commands (Gauge)
- `obd_timeouts_total` - Total timeouts (Gauge)
- `obd_average_latency_milliseconds` - Average latency (Gauge)
- `obd_last_command_duration_milliseconds` - Last command duration (Gauge)
- `obd_metrics_last_updated_timestamp_seconds` - Last update timestamp (Gauge)

## Testing

```bash
# Run unit tests
npm test

# Run specific test file
npm test -- --test-name-pattern="DtcParser"
```

## Development

### DEV Mode

Set `AGENT_ENV=DEV` for development mode features:

- Mock transport available
- Additional debug logging
- Relaxed validation

### Mock Transport

```typescript
import { DevTransport } from './devices/obd/driver/DevTransport.js';

if (process.env.AGENT_ENV === 'DEV') {
  const mockTransport = new DevTransport();
  driver = new Elm327Driver();
  await driver.init({ transport: mockTransport });
}
```

## Troubleshooting

### Connection Issues

1. **Check port name**: Verify COM port (Windows) or /dev/ttyUSB0 (Linux)
2. **Check permissions**: On Linux, add user to `dialout` group
3. **Check baudrate**: ELM327 typically uses 38400 or 9600
4. **Check adapter**: Some cheap clones have firmware bugs

### Timeout Issues

1. **Increase timeout**: Some vehicles respond slowly
2. **Check protocol**: Try manual protocol selection
3. **Check vehicle**: Ensure vehicle is running and OBD port is accessible

### Parse Errors

1. **Check response format**: Some adapters add extra characters
2. **Update firmware**: Older ELM327 firmware has bugs
3. **Use genuine adapter**: Clone adapters may not follow spec

## References

- [ELM327 Datasheet](https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327DS.pdf)
- [SAE J1979](https://www.sae.org/standards/content/j1979_201202/) - OBD-II PIDs
- [SAE J2012](https://www.sae.org/standards/content/j2012_201703/) - DTC Definitions
- [ISO 15031-5](https://www.iso.org/standard/55460.html) - Emissions Diagnostic Services

## License

See project root LICENSE file.
