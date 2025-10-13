/**
 * Shared Prometheus metrics for lock operations
 *
 * Централизованное место для метрик, используемых всеми драйверами замков.
 * Предотвращает конфликты при повторной регистрации метрик.
 */

import { Counter, Gauge, Registry, register } from 'prom-client';

// Helper для создания/получения метрик (предотвращает повторную регистрацию)
function getOrCreateCounter(config: { name: string; help: string; labelNames?: string[] }): Counter {
  const existing = register.getSingleMetric(config.name);
  if (existing) {
    return existing as Counter;
  }
  return new Counter(config);
}

function getOrCreateGauge(config: { name: string; help: string; labelNames?: string[] }): Gauge {
  const existing = register.getSingleMetric(config.name);
  if (existing) {
    return existing as Gauge;
  }
  return new Gauge(config);
}

// Метрики замков
export const lockOperations = getOrCreateCounter({
  name: 'lock_operations_total',
  help: 'Total lock operations',
  labelNames: ['device', 'operation', 'status'],
});

export const lockAutoClose = getOrCreateCounter({
  name: 'lock_auto_close_total',
  help: 'Total auto-close events',
  labelNames: ['device'],
});

export const lockEmergencyClose = getOrCreateCounter({
  name: 'lock_emergency_close_total',
  help: 'Total emergency close events',
});

export const lockOpenDuration = getOrCreateCounter({
  name: 'lock_open_duration_seconds',
  help: 'Duration lock was open',
  labelNames: ['device'],
});

export const lockOpenGauge = getOrCreateGauge({
  name: 'lock_is_open',
  help: 'Lock open state (1=open, 0=closed)',
  labelNames: ['device'],
});
