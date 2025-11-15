import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAlerts } from '../alerts.js';

const ENV_PROD = 'PROD';

function baseInput() {
  return {
    environment: ENV_PROD,
    timestamp: new Date('2025-10-09T10:00:00.000Z').toISOString(),
    payments: { total: 0, confirmed: 0 }
  } as any;
}

test('emits warning and critical for queue depth thresholds', () => {
  const warningAlerts = evaluateAlerts({ ...baseInput(), ble: { queueDepth: 11 } });
  assert.ok(warningAlerts.find(a => a.id === 'ble_queue_depth_high' && a.severity === 'warning'));

  const criticalAlerts = evaluateAlerts({ ...baseInput(), ble: { queueDepth: 30 } });
  assert.ok(criticalAlerts.find(a => a.id === 'ble_queue_depth_high' && a.severity === 'critical'));
});

test('emits watchdog alert with severity scaling', () => {
  const warn = evaluateAlerts({ ...baseInput(), ble: { watchdogTriggers: 3 } });
  assert.ok(warn.find(a => a.id === 'ble_watchdog_many_triggers' && a.severity === 'warning'));

  const crit = evaluateAlerts({ ...baseInput(), ble: { watchdogTriggers: 12 } });
  assert.ok(crit.find(a => a.id === 'ble_watchdog_many_triggers' && a.severity === 'critical'));
});

test('emits stability info alert after long period without reconnect', () => {
  const input = baseInput();
  // secondsSinceLastReconnect > default 3600
  const alerts = evaluateAlerts({ ...input, ble: { secondsSinceLastReconnect: 3700 } });
  assert.ok(alerts.find(a => a.id === 'ble_no_reconnect_long_period' && a.severity === 'info'));
});

test('emits latency warning and critical alerts based on averageLatencyMs thresholds', () => {
  // Warning: default BLE_LATENCY_WARN_MS = 800, set averageLatencyMs just above
  const warnAlerts = evaluateAlerts({ ...baseInput(), ble: { averageLatencyMs: 850, lastDurationMs: 900 } });
  assert.ok(warnAlerts.find(a => a.id === 'ble_latency_high' && a.severity === 'warning'));

  // Critical: default BLE_LATENCY_CRIT_MS = 1500
  const critAlerts = evaluateAlerts({ ...baseInput(), ble: { averageLatencyMs: 1600, lastDurationMs: 1700 } });
  assert.ok(critAlerts.find(a => a.id === 'ble_latency_high' && a.severity === 'critical'));
});

test('emits success-specific latency alert', () => {
  const warn = evaluateAlerts({ ...baseInput(), ble: { averageSuccessLatencyMs: 820 } });
  assert.ok(warn.find(a => a.id === 'ble_success_latency_high' && a.severity === 'warning'));
  const crit = evaluateAlerts({ ...baseInput(), ble: { averageSuccessLatencyMs: 1601 } });
  assert.ok(crit.find(a => a.id === 'ble_success_latency_high' && a.severity === 'critical'));
});

test('emits error-specific latency alert', () => {
  const warn = evaluateAlerts({ ...baseInput(), ble: { averageErrorLatencyMs: 805 } });
  assert.ok(warn.find(a => a.id === 'ble_error_latency_high' && a.severity === 'warning'));
  const crit = evaluateAlerts({ ...baseInput(), ble: { averageErrorLatencyMs: 1700 } });
  assert.ok(crit.find(a => a.id === 'ble_error_latency_high' && a.severity === 'critical'));
});

test('emits stall warning and critical alerts based on secondsSinceLastCommandCompleted', () => {
  // Warning: default BLE_COMMAND_STALL_WARN_SEC = 20
  const warn = evaluateAlerts({ ...baseInput(), ble: { secondsSinceLastCommandCompleted: 25 } });
  assert.ok(warn.find(a => a.id === 'ble_command_processing_stall' && a.severity === 'warning'));

  // Critical: default BLE_COMMAND_STALL_CRIT_SEC = 60
  const crit = evaluateAlerts({ ...baseInput(), ble: { secondsSinceLastCommandCompleted: 65 } });
  assert.ok(crit.find(a => a.id === 'ble_command_processing_stall' && a.severity === 'critical'));
});
