/**
 * Prometheus Metrics Collector for OBD-II Driver
 * Exports driver metrics for monitoring and alerting
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import type { Elm327Driver } from './Elm327Driver.js';

export interface ObdPrometheusCollector {
  readonly register: Registry;
  update(): void;
}

export interface ObdPrometheusOptions {
  register?: Registry;
}

export function createObdPrometheusCollector(
  driver: Elm327Driver,
  options: ObdPrometheusOptions = {}
): ObdPrometheusCollector {
  const register = options.register ?? new Registry();

  const connectionsTotal = new Counter({
    name: 'obd_connections_total',
    help: 'Total number of OBD adapter connection attempts',
    registers: [register],
  });

  const dtcReadTotal = new Counter({
    name: 'obd_dtc_read_total',
    help: 'Total number of DTC read operations',
    registers: [register],
  });

  const dtcClearedTotal = new Counter({
    name: 'obd_dtc_cleared_total',
    help: 'Total number of DTC clear operations',
    registers: [register],
  });

  const pidReadTotal = new Counter({
    name: 'obd_pid_read_total',
    help: 'Total number of PID read operations by PID',
    labelNames: ['pid'],
    registers: [register],
  });

  const errorsTotal = new Counter({
    name: 'obd_errors_total',
    help: 'Total number of OBD errors by type',
    labelNames: ['type'],
    registers: [register],
  });

  const commandDuration = new Histogram({
    name: 'obd_command_duration_seconds',
    help: 'Duration of OBD commands in seconds',
    labelNames: ['command'],
    buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
    registers: [register],
  });

  const totalCommands = new Gauge({
    name: 'obd_total_commands',
    help: 'Total number of commands sent to OBD adapter',
    registers: [register],
  });

  const successfulCommands = new Gauge({
    name: 'obd_successful_commands',
    help: 'Total number of successful commands',
    registers: [register],
  });

  const failedCommands = new Gauge({
    name: 'obd_failed_commands',
    help: 'Total number of failed commands',
    registers: [register],
  });

  const timeouts = new Gauge({
    name: 'obd_timeouts_total',
    help: 'Total number of command timeouts',
    registers: [register],
  });

  const averageLatency = new Gauge({
    name: 'obd_average_latency_milliseconds',
    help: 'Average command latency in milliseconds',
    registers: [register],
  });

  const lastCommandDuration = new Gauge({
    name: 'obd_last_command_duration_milliseconds',
    help: 'Duration of the last command in milliseconds',
    registers: [register],
  });

  const lastUpdateTimestamp = new Gauge({
    name: 'obd_metrics_last_updated_timestamp_seconds',
    help: 'Unix timestamp of the last metrics update',
    registers: [register],
  });

  const queueDepthGauge = new Gauge({
    name: 'obd_queue_depth',
    help: 'Current command queue depth',
    registers: [register],
  });

  const queueDepthMaxGauge = new Gauge({
    name: 'obd_queue_depth_max_observed',
    help: 'Maximum observed command queue depth since start',
    registers: [register],
  });

  const reconnectLastDuration = new Gauge({
    name: 'obd_reconnect_last_duration_seconds',
    help: 'Duration of last successful reconnect in seconds',
    registers: [register],
  });

  const reconnectTotalDuration = new Gauge({
    name: 'obd_reconnect_total_duration_seconds',
    help: 'Accumulated total reconnect duration in seconds',
    registers: [register],
  });

  const watchdogTriggersGauge = new Gauge({
    name: 'obd_watchdog_triggers_total',
    help: 'Total number of watchdog triggers (forced disconnects due to stalled responses)',
    registers: [register],
  });

  return {
    register,
    update(): void {
      const metrics = driver.getMetrics();

      totalCommands.set(metrics.totalCommands);
      successfulCommands.set(metrics.successfulCommands);
      failedCommands.set(metrics.failedCommands);
      timeouts.set(metrics.timeouts);
      averageLatency.set(metrics.averageLatencyMs);

      if (metrics.lastDurationMs !== undefined) {
        lastCommandDuration.set(metrics.lastDurationMs);
      }

      if (metrics.lastUpdatedAt) {
        const parsed = Date.parse(metrics.lastUpdatedAt);
        if (!Number.isNaN(parsed)) {
          lastUpdateTimestamp.set(parsed / 1000);
        }
      }
      const extra: any = metrics as any;
      if (extra.queueDepth !== undefined) queueDepthGauge.set(extra.queueDepth);
      if (extra.maxQueueDepthObserved !== undefined) queueDepthMaxGauge.set(extra.maxQueueDepthObserved);
      if (extra.lastReconnectDurationSeconds !== undefined) reconnectLastDuration.set(extra.lastReconnectDurationSeconds);
      if (extra.totalReconnectDurationSeconds !== undefined) reconnectTotalDuration.set(extra.totalReconnectDurationSeconds);
      if (extra.watchdogTriggers !== undefined) watchdogTriggersGauge.set(extra.watchdogTriggers);
    },
  };
}
