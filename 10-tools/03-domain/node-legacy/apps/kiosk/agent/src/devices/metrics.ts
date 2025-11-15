/**
 * Prometheus metrics collector for device operations
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { getDeviceStorage } from './common/storage.js';

export function createDeviceMetricsCollector(registry: Registry) {
  // Device connection metrics
  const deviceConnections = new Counter({
    name: 'device_connections_total',
    help: 'Total number of device connection attempts',
    labelNames: ['device_type', 'result'],
    registers: [registry],
  });

  const deviceConnectionDuration = new Histogram({
    name: 'device_connection_duration_seconds',
    help: 'Duration of device connection attempts',
    labelNames: ['device_type', 'result'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [registry],
  });

  const deviceState = new Gauge({
    name: 'device_state',
    help: 'Current device state (0=disconnected, 1=connecting, 2=connected, 3=ready, 4=busy, 5=error)',
    labelNames: ['device_type'],
    registers: [registry],
  });

  // OBD-II specific metrics
  const obdOperations = new Counter({
    name: 'obd_operations_total',
    help: 'Total number of OBD operations',
    labelNames: ['operation', 'result'],
    registers: [registry],
  });

  const obdOperationDuration = new Histogram({
    name: 'obd_operation_duration_seconds',
    help: 'Duration of OBD operations',
    labelNames: ['operation'],
    buckets: [0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const obdDtcCount = new Gauge({
    name: 'obd_dtc_count',
    help: 'Number of diagnostic trouble codes detected',
    registers: [registry],
  });

  // Thickness gauge specific metrics
  const thicknessMeasurements = new Counter({
    name: 'thickness_measurements_total',
    help: 'Total number of thickness measurements taken',
    labelNames: ['zone_category'],
    registers: [registry],
  });

  const thicknessDeviation = new Histogram({
    name: 'thickness_deviation_micrometers',
    help: 'Deviation from standard thickness in micrometers',
    labelNames: ['zone_category'],
    buckets: [0, 10, 30, 50, 80, 100, 150, 200],
    registers: [registry],
  });

  const thicknessProgress = new Gauge({
    name: 'thickness_measurement_progress',
    help: 'Progress of thickness measurement (0-100%)',
    registers: [registry],
  });

  // Storage metrics
  const storageEvents = new Gauge({
    name: 'device_storage_events_total',
    help: 'Total number of events in storage',
    labelNames: ['device_type'],
    registers: [registry],
  });

  // Update function to be called periodically
  const updateMetrics = () => {
    const storage = getDeviceStorage();

    // Update storage event counts
    const obdEvents = storage.getRecentEvents('obd', 10000);
    const thicknessEvents = storage.getRecentEvents('thickness', 10000);
    storageEvents.set({ device_type: 'obd' }, obdEvents.length);
    storageEvents.set({ device_type: 'thickness' }, thicknessEvents.length);

    // Update device states
    const obdState = storage.getState('obd');
    const thicknessState = storage.getState('thickness');

    if (obdState) {
      const stateMap: Record<string, number> = {
        disconnected: 0,
        connecting: 1,
        connected: 2,
        ready: 3,
        busy: 4,
        error: 5,
      };
      deviceState.set({ device_type: 'obd' }, stateMap[obdState.state] || 0);
    }

    if (thicknessState) {
      const stateMap: Record<string, number> = {
        disconnected: 0,
        scanning: 1,
        connecting: 1,
        connected: 2,
        ready: 3,
        measuring: 4,
        error: 5,
      };
      deviceState.set({ device_type: 'thickness' }, stateMap[thicknessState.state] || 0);
    }
  };

  return {
    deviceConnections,
    deviceConnectionDuration,
    deviceState,
    obdOperations,
    obdOperationDuration,
    obdDtcCount,
    thicknessMeasurements,
    thicknessDeviation,
    thicknessProgress,
    storageEvents,
    updateMetrics,
  };
}

export type DeviceMetricsCollector = ReturnType<typeof createDeviceMetricsCollector>;
