import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export interface BleMetrics {
  connectionsTotal: Counter<'phase'|'result'>;
  connectionDuration: Histogram<'phase'>;
  bytesSentTotal: Counter<string>;
  bytesReceivedTotal: Counter<string>;
  lastRssi: Gauge<string>;
  commandsTotal: Counter<'status'>;
  commandLatency: Histogram<string>;
  disconnectsTotal: Counter<string>;
  reconnectAttemptsTotal: Counter<string>;
  reconnectSuccessTotal: Counter<string>;
  reconnectFailedTotal: Counter<string>;
  connectionState: Gauge<string>; // 0=disconnected,1=connecting,2=connected
  queueDepth: Gauge<string>;
  maxQueueDepthObserved: Gauge<string>;
  lastReconnectDuration: Gauge<string>; // seconds
  totalReconnectDuration: Counter<string>; // accumulated seconds
  watchdogTriggersTotal: Counter<string>;
  reconnectDuration: Histogram<string>; // distribution of reconnect durations
  secondsSinceLastReconnect: Gauge<string>;
  secondsSinceLastWatchdogTrigger: Gauge<string>;
}

export function createBleMetrics(register: Registry): BleMetrics {
  const connectionsTotal = new Counter({
    name: 'ble_connections_total',
    help: 'BLE connection attempts grouped by phase/result',
    labelNames: ['phase','result'],
    registers: [register],
  });
  const connectionDuration = new Histogram({
    name: 'ble_connection_duration_seconds',
    help: 'Duration of BLE connection sequences',
    labelNames: ['phase'],
    buckets: [0.5,1,2,5,10,20,30],
    registers: [register],
  });
  const bytesSentTotal = new Counter({
    name: 'ble_bytes_sent_total',
    help: 'Total bytes sent to BLE adapter',
    registers: [register],
  });
  const bytesReceivedTotal = new Counter({
    name: 'ble_bytes_received_total',
    help: 'Total bytes received from BLE adapter',
    registers: [register],
  });
  const lastRssi = new Gauge({
    name: 'ble_last_rssi',
    help: 'RSSI of last discovered/connected peripheral',
    registers: [register],
  });
  const commandsTotal = new Counter({
    name: 'ble_commands_total',
    help: 'Total BLE/OBD commands dispatched over BLE transport',
    labelNames: ['status'],
    registers: [register],
  });
  const commandLatency = new Histogram({
    name: 'ble_command_latency_seconds',
    help: 'Latency of BLE command round trips',
    buckets: [0.05,0.1,0.2,0.5,1,2,5],
    registers: [register],
  });
  const disconnectsTotal = new Counter({
    name: 'ble_disconnects_total',
    help: 'Total BLE disconnect events (adapter lost connection)',
    registers: [register],
  });
  const reconnectAttemptsTotal = new Counter({
    name: 'ble_reconnect_attempts_total',
    help: 'Total auto-reconnect attempts initiated by driver',
    registers: [register],
  });
  const reconnectSuccessTotal = new Counter({
    name: 'ble_reconnect_success_total',
    help: 'Total successful BLE reconnects',
    registers: [register],
  });
  const reconnectFailedTotal = new Counter({
    name: 'ble_reconnect_failed_total',
    help: 'Total failed BLE reconnect attempts',
    registers: [register],
  });
  const connectionState = new Gauge({
    name: 'ble_connection_state',
    help: 'Current BLE connection state (0=disconnected,1=connecting,2=connected)',
    registers: [register],
  });
  const queueDepth = new Gauge({
    name: 'ble_queue_depth',
    help: 'Current depth of BLE command queue',
    registers: [register],
  });
  const maxQueueDepthObserved = new Gauge({
    name: 'ble_max_queue_depth_observed',
    help: 'Maximum depth observed for BLE command queue since start',
    registers: [register],
  });
  const lastReconnectDuration = new Gauge({
    name: 'ble_last_reconnect_duration_seconds',
    help: 'Duration of last successful BLE reconnect sequence in seconds',
    registers: [register],
  });
  const totalReconnectDuration = new Counter({
    name: 'ble_total_reconnect_duration_seconds',
    help: 'Accumulated seconds spent on successful BLE reconnect sequences',
    registers: [register],
  });
  const watchdogTriggersTotal = new Counter({
    name: 'ble_watchdog_triggers_total',
    help: 'Total watchdog trigger events (stalled command flow leading to forced reset)',
    registers: [register],
  });
  const reconnectDuration = new Histogram({
    name: 'ble_reconnect_duration_seconds',
    help: 'Histogram of BLE reconnect durations',
    labelNames: ['phase'],
    buckets: [0.5,1,2,3,5,8,13,21,34],
    registers: [register],
  });
  const secondsSinceLastReconnect = new Gauge({
    name: 'ble_seconds_since_last_reconnect',
    help: 'Seconds since last successful BLE reconnect (or initial connect); -1 если неизвестно',
    registers: [register],
  });
  const secondsSinceLastWatchdogTrigger = new Gauge({
    name: 'ble_seconds_since_last_watchdog_trigger',
    help: 'Seconds since last watchdog trigger; -1 если ни одного триггера',
    registers: [register],
  });
  return {
    connectionsTotal,
    connectionDuration,
    bytesSentTotal,
    bytesReceivedTotal,
    lastRssi,
    commandsTotal,
    commandLatency,
    disconnectsTotal,
    reconnectAttemptsTotal,
    reconnectSuccessTotal,
    reconnectFailedTotal,
    connectionState,
    queueDepth,
    maxQueueDepthObserved,
    lastReconnectDuration,
    totalReconnectDuration,
    watchdogTriggersTotal,
    reconnectDuration,
    secondsSinceLastReconnect,
    secondsSinceLastWatchdogTrigger,
  };
}
