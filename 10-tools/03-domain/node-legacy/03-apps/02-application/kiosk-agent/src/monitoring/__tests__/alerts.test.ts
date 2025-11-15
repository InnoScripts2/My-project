import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAlerts } from '../alerts.js';
import { PaymentMetricsSnapshot } from '../../payments/metrics.js';

function makePaymentsSnapshot(overrides: Partial<PaymentMetricsSnapshot> = {}): PaymentMetricsSnapshot {
  return {
    totalIntents: 0,
    pendingOver90s: 0,
    manualConfirmations: 0,
    devConfirmations: 0,
    lastEventAt: undefined,
    ...overrides
  };
}

const ENV_DEV = 'DEV';
const ENV_PROD = 'PROD';

test('returns empty array when no metrics provided', () => {
  const alerts = evaluateAlerts({ environment: ENV_DEV });
  assert.deepEqual(alerts, []);
});

test('does not emit alert when payments are healthy', () => {
  const alerts = evaluateAlerts({ environment: ENV_DEV, payments: makePaymentsSnapshot() });
  assert.equal(alerts.length, 0);
});

test('emits critical alert when pending payments exceed threshold', () => {
  const snapshot = makePaymentsSnapshot({ totalIntents: 3, pendingOver90s: 2, lastEventAt: '2025-10-01T10:00:00.000Z' });
  const alerts = evaluateAlerts({ environment: ENV_PROD, payments: snapshot, timestamp: new Date('2025-10-01T10:05:00.000Z') });

  assert.equal(alerts.length, 1);
  const alert = alerts[0];
  assert.equal(alert.id, 'payments.pending_over_90s');
  assert.equal(alert.severity, 'critical');
  assert.equal(alert.title, 'Зависшие оплаты');
  assert.match(alert.description, /2 оплат/);
  assert.equal(alert.detectedAt, '2025-10-01T10:05:00.000Z');
  assert.deepEqual(alert.data, {
    pendingOver90s: 2,
    totalIntents: 3,
    lastEventAt: '2025-10-01T10:00:00.000Z',
    environment: ENV_PROD
  });
});

test('downgrades severity to warning in DEV environment', () => {
  const snapshot = makePaymentsSnapshot({ pendingOver90s: 1 });
  const alerts = evaluateAlerts({ environment: ENV_DEV, payments: snapshot });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.severity, 'warning');
  assert.equal(alerts[0]?.data?.environment, ENV_DEV);
});

test('sorts alerts by severity and id for determinism', () => {
  const timestamp = new Date('2025-10-01T09:00:00.000Z');
  const alerts = evaluateAlerts({
    environment: ENV_PROD,
    payments: makePaymentsSnapshot({ pendingOver90s: 1 }),
    timestamp
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.detectedAt, timestamp.toISOString());
});
