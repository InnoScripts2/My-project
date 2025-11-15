/**
 * Prometheus metrics for device drivers
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export interface DeviceMetricsCollector {
  recordOperation(deviceType: string, operation: string, success: boolean, durationMs: number): void;
  recordConnection(deviceType: string, connected: boolean): void;
  recordError(deviceType: string, errorType: string): void;
  getRegistry(): Registry;
}

export function createDeviceMetricsCollector(registry?: Registry): DeviceMetricsCollector {
  const reg = registry || new Registry();

  const operationsTotal = new Counter({
    name: 'device_operations_total',
    help: 'Total number of device operations',
    labelNames: ['device_type', 'operation', 'status'],
    registers: [reg],
  });

  const operationDuration = new Histogram({
    name: 'device_operation_duration_seconds',
    help: 'Device operation duration in seconds',
    labelNames: ['device_type', 'operation'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    registers: [reg],
  });

  const connectionStatus = new Gauge({
    name: 'device_connection_status',
    help: 'Device connection status (1=connected, 0=disconnected)',
    labelNames: ['device_type'],
    registers: [reg],
  });

  const errorsTotal = new Counter({
    name: 'device_errors_total',
    help: 'Total number of device errors',
    labelNames: ['device_type', 'error_type'],
    registers: [reg],
  });

  const reconnectAttempts = new Counter({
    name: 'device_reconnect_attempts_total',
    help: 'Total number of reconnection attempts',
    labelNames: ['device_type'],
    registers: [reg],
  });

  const sessionDuration = new Histogram({
    name: 'device_session_duration_seconds',
    help: 'Device session duration in seconds',
    labelNames: ['device_type'],
    buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
    registers: [reg],
  });

  return {
    recordOperation(deviceType: string, operation: string, success: boolean, durationMs: number) {
      operationsTotal.inc({
        device_type: deviceType,
        operation,
        status: success ? 'success' : 'failure',
      });

      operationDuration.observe(
        {
          device_type: deviceType,
          operation,
        },
        durationMs / 1000
      );
    },

    recordConnection(deviceType: string, connected: boolean) {
      connectionStatus.set({ device_type: deviceType }, connected ? 1 : 0);
    },

    recordError(deviceType: string, errorType: string) {
      errorsTotal.inc({
        device_type: deviceType,
        error_type: errorType,
      });
    },

    getRegistry() {
      return reg;
    },
  };
}

// Singleton instance
let metricsCollectorInstance: DeviceMetricsCollector | null = null;

export function getDeviceMetricsCollector(registry?: Registry): DeviceMetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = createDeviceMetricsCollector(registry);
  }
  return metricsCollectorInstance;
}
