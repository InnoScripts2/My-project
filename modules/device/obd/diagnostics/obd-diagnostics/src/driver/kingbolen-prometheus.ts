/**
 * Prometheus collector для KingbolenEdiagDriver (BLE)
 * Публикует расширенные метрики адаптера: очередь команд, перезапуски, watchdog.
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { KingbolenEdiagDriver, KingbolenEdiagMetrics } from '../KingbolenEdiagDriver.js';

export interface KingbolenPrometheusCollector {
  readonly register: Registry;
  update(): void; // периодический снимок stateful метрик
}

export interface KingbolenPrometheusOptions { register?: Registry }

export function createKingbolenPrometheusCollector(
  driver: KingbolenEdiagDriver,
  opts: KingbolenPrometheusOptions = {}
): KingbolenPrometheusCollector {
  const register = opts.register ?? new Registry();

  // Событийный счётчик по типу события
  const bleEventsTotal = new Counter({
    name: 'obd_ble_events_total',
    help: 'BLE driver emitted events total grouped by event type',
    labelNames: ['event'],
    registers: [register],
  });

  const watchdogTriggersTotal = new Counter({
    name: 'obd_ble_watchdog_triggers_total',
    help: 'Total watchdog triggers (столбняк ответа -> форс disconnect)',
    registers: [register],
  });

  const queueDepthGauge = new Gauge({
    name: 'obd_ble_queue_depth',
    help: 'Текущая глубина очереди BLE команд',
    registers: [register],
  });

  const queueDepthMaxGauge = new Gauge({
    name: 'obd_ble_queue_depth_max_observed',
    help: 'Максимальная наблюдаемая глубина очереди с момента запуска',
    registers: [register],
  });

  const reconnectLastDurationGauge = new Gauge({
    name: 'obd_ble_reconnect_last_duration_seconds',
    help: 'Длительность последнего успешного reconnect (секунды)',
    registers: [register],
  });

  const reconnectTotalDurationGauge = new Gauge({
    name: 'obd_ble_reconnect_total_duration_seconds',
    help: 'Суммарная длительность всех успешных reconnect (секунды)',
    registers: [register],
  });

  const commandLatencyHistogram = new Histogram({
    name: 'obd_ble_command_latency_seconds',
    help: 'Latency отдельных BLE команд',
    labelNames: ['command'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
    registers: [register],
  });

  // Подписка на события драйвера (idempotent достаточно один раз при создании)
  const subscribe = () => {
    const on = driver.on.bind(driver);
    const count = (ev: string) => bleEventsTotal.inc({ event: ev });
    on('ble_connect_attempt', () => count('connect_attempt'));
    on('ble_connected', () => count('connected'));
    on('ble_reconnect_attempt', () => count('reconnect_attempt'));
    on('ble_reconnect_success', () => count('reconnect_success'));
    on('ble_reconnect_failed', () => count('reconnect_failed'));
    on('ble_reconnect_scheduled', () => count('reconnect_scheduled'));
    on('ble_disconnected', () => count('disconnected'));
    on('ble_command_sent', () => count('command_sent'));
    on('ble_command_completed', (p: any) => {
      count('command_completed');
      if (p?.durationMs && p?.command) {
        commandLatencyHistogram.observe({ command: String(p.command) }, p.durationMs / 1000);
      }
    });
    on('ble_command_failed', () => count('command_failed'));
    on('ble_watchdog_trigger', () => {
      count('watchdog_trigger');
      watchdogTriggersTotal.inc();
    });
    on('ble_data_received', () => count('data_received'));
  };
  subscribe();

  return {
    register,
    update(): void {
      const m: KingbolenEdiagMetrics = driver.getMetrics();
      if (m.queueDepth !== undefined) queueDepthGauge.set(m.queueDepth);
      if (m.maxQueueDepthObserved !== undefined) queueDepthMaxGauge.set(m.maxQueueDepthObserved);
      if (m.lastReconnectDurationSeconds !== undefined) reconnectLastDurationGauge.set(m.lastReconnectDurationSeconds);
      if (m.totalReconnectDurationSeconds !== undefined) reconnectTotalDurationGauge.set(m.totalReconnectDurationSeconds);
      // watchdogTriggersTotal обновляется событийно (counter), нет необходимости сетать здесь
    },
  };
}
