# Common Device Utilities

Shared utilities and interfaces for all device drivers (OBD-II, Thickness Gauge).

## Architecture

```
common/
  interfaces.ts              - Base Device interface, DeviceState enum
  errors.ts                  - Device error hierarchy
  retry.ts                   - Exponential backoff retry policy
  logger.ts                  - Structured logging
  storage.ts                 - SQLite telemetry storage
  connection-manager.ts      - Connection state machine
  health-check-service.ts    - Health monitoring
  prometheus-metrics.ts      - Metrics collection
```

## Key Components

### DeviceState Enum

Device lifecycle states:

- `DISCONNECTED`: No connection to device
- `CONNECTING`: Attempting to establish connection
- `INITIALIZING`: Connected, performing initialization
- `READY`: Initialized and ready for operations
- `BUSY`: Currently performing an operation
- `ERROR`: Error state, requires intervention
- `BACKOFF`: Waiting before retry
- `RECONNECTING`: Attempting to reconnect after connection loss

### Error Hierarchy

All device errors extend `DeviceError` with error codes:

- `DeviceConnectionError`: Connection-related failures
- `DeviceTimeoutError`: Operation timeouts
- `DeviceProtocolError`: Protocol/communication errors
- `DeviceNotFoundError`: Device not detected
- `DeviceConfigurationError`: Configuration issues

### Retry Policy

Exponential backoff with jitter:

```typescript
const policy: RetryPolicyOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

await retryWithPolicy(
  async (attempt) => {
    await riskyOperation();
  },
  policy
);
```

### Connection Manager

Production-grade connection state machine:

```typescript
const manager = new ConnectionManager({
  deviceType: 'obd',
  autoReconnect: true,
  maxReconnectAttempts: 5,
});

manager.on('state_changed', (newState, oldState) => {
  console.log(`State: ${oldState} -> ${newState}`);
});

await manager.connect(
  async () => await connectToDevice(),
  async () => await initializeDevice()
);
```

### Health Check Service

Continuous health monitoring:

```typescript
const healthService = getHealthCheckService(30000); // 30s interval
healthService.start();

healthService.on('health_check_completed', (status) => {
  console.log('Overall health:', status.overall);
  console.log('OBD status:', status.devices.obd.status);
  console.log('Thickness status:', status.devices.thickness.status);
});

// Manual check
const status = await healthService.runManualCheck();
```

### Prometheus Metrics

Device operation metrics:

```typescript
const metrics = getDeviceMetricsCollector();

// Record operation
metrics.recordOperation('obd', 'read_dtc', true, 1250);

// Record connection status
metrics.recordConnection('obd', true);

// Record error
metrics.recordError('obd', 'timeout');

// Export metrics
const registry = metrics.getRegistry();
console.log(await registry.metrics());
```

## Storage Schema

SQLite database: `storage/devices.sqlite`

### Tables

**device_states**: Current state of each device
- device_type: 'obd' | 'thickness'
- state: current state string
- connected: boolean
- last_connected: ISO timestamp
- last_error: error message
- updated_at: ISO timestamp

**device_events**: Event history
- id: UUID
- timestamp: ISO timestamp
- device_type: 'obd' | 'thickness'
- event_type: 'connected' | 'disconnected' | 'error' | 'reconnect_attempt'
- state: state at event time
- previous_state: previous state
- error: error message if applicable

**device_connections**: Connection sessions
- id: UUID (session ID)
- device_type: 'obd' | 'thickness'
- started_at: ISO timestamp
- ended_at: ISO timestamp
- duration_ms: session duration
- state_transitions: JSON array of transitions
- success: boolean
- error: error message if failed

**device_metrics**: Time-series metrics
- id: auto-increment
- device_type: 'obd' | 'thickness'
- timestamp: ISO timestamp
- metric_name: metric identifier
- metric_value: numeric value
- unit: measurement unit
- metadata: JSON additional context

**obd_sessions**: OBD diagnostic sessions
- id: UUID
- started_at: ISO timestamp
- ended_at: ISO timestamp
- adapter_info: adapter model/version
- protocol: OBD protocol used
- dtc_count: number of DTCs found
- dtc_codes: JSON array of DTC codes
- dtc_cleared: boolean
- pids_read: JSON array of PIDs read
- success: boolean
- error: error message if failed

**thickness_sessions**: Thickness measurement sessions
- id: UUID
- started_at: ISO timestamp
- ended_at: ISO timestamp
- device_name: BLE device name
- device_address: BLE MAC address
- total_zones: number of zones expected
- measured_zones: number of zones measured
- measurements: JSON array of measurements
- success: boolean
- error: error message if failed

## Logging

Structured JSON logging:

```typescript
const logger = createLogger('MyDevice');

logger.info('Device connected', { port: '/dev/ttyUSB0' });
logger.warn('High response time', { responseTimeMs: 3500 });
logger.error('Connection failed', { error: err.message });
logger.debug('Raw data received', { data: rawBuffer });
```

Log levels:
- `debug`: Detailed diagnostic information (DEV only)
- `info`: General informational messages
- `warn`: Warning messages, degraded operation
- `error`: Error messages, operation failed

## Environment Variables

Configure retry policy:

```bash
DEVICE_RETRY_MAX_ATTEMPTS=5
DEVICE_RETRY_BASE_DELAY_MS=1000
DEVICE_RETRY_MAX_DELAY_MS=30000
DEVICE_RETRY_BACKOFF_MULTIPLIER=2
DEVICE_RETRY_JITTER_FACTOR=0.3
```

Enable debug logging:

```bash
LOG_LEVEL=debug
AGENT_ENV=DEV
```

## Production Guidelines

### No Simulations in PROD

- MockTransport throws error if instantiated in PROD
- ThicknessDriver does not generate fake measurements
- All DEV-only code paths are guarded with `AGENT_ENV === 'DEV'`
- UI "Skip" button only available with `?dev=1` flag

### Connection Reliability

- Use ConnectionManager for automatic reconnection
- Set appropriate maxReconnectAttempts (3-5 recommended)
- Monitor reconnection metrics
- Handle USB re-enumeration on Windows

### Metrics and Monitoring

- Record all operations with recordOperation()
- Monitor success rate (target: >95%)
- Alert on high error rate
- Track response times
- Export Prometheus metrics on /metrics endpoint

### Error Handling

- Always use structured errors (DeviceError hierarchy)
- Log errors with context
- Implement circuit breaker for repeated failures
- Graceful degradation when possible
- Clear error messages to users

### Health Checks

- Run periodic health checks (30s recommended)
- Monitor degradation reasons
- Alert on unhealthy status
- Implement manual check endpoint

## Testing

Unit tests for all components:

```bash
npm --prefix apps/kiosk-agent test
```

Test with real hardware when available:

```bash
AGENT_ENV=DEV npm --prefix apps/kiosk-agent run self-check:obd
```

## Examples

See `examples.ts` for comprehensive usage examples.
