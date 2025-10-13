import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDiagnosticsEventStore } from './diagnosticsEventStore.js';

test('summarize aggregates daily operation buckets', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'diagnostics-store-'));
  const databasePath = join(tempDir, 'events.sqlite');
  const store = createDiagnosticsEventStore({ databasePath });

  t.after(() => {
    store.close?.();
    rmSync(tempDir, { recursive: true, force: true });
  });

  if (!store.enabled || store.driver !== 'sqlite' || typeof store.summarize !== 'function') {
    t.skip('SQLite driver unavailable in test environment');
    return;
  }

  const baseEvent = {
    type: 'operation' as const,
    attempt: 1,
    attemptsAllowed: 1,
    durationMs: 1200,
  };

  store.record({
    ...baseEvent,
    id: 'evt-1',
    at: '2024-04-01T10:00:00.000Z',
    operation: 'read_dtc',
    outcome: 'success',
  });

  store.record({
    ...baseEvent,
    id: 'evt-2',
    at: '2024-04-01T12:00:00.000Z',
    operation: 'live_data',
    outcome: 'failure',
    error: 'stream_fail',
  });

  store.record({
    ...baseEvent,
    id: 'evt-3',
    at: '2024-04-02T09:30:00.000Z',
    operation: 'status',
    outcome: 'success',
  });

  const summary = store.summarize({ maxDays: 10 });
  assert.ok(summary, 'summary should be available when store is enabled');
  assert.ok(Array.isArray(summary.operations.daily));
  assert.equal(summary.operations.daily.length >= 2, true);
  assert.ok(summary.rolling, 'rolling summary should be present');
  assert.equal(summary.rolling.last7Days.windowDays, 7);
  assert.equal(summary.rolling.last30Days.windowDays, 30);
  assert.ok(summary.rolling.last7Days.byOperation.read_dtc);
  assert.ok(Array.isArray(summary.rolling.last7Days.topFailures));
  assert.ok(summary.operations.trends);
  assert.ok(summary.operations.trends.byOperation.read_dtc);
  assert.equal(typeof summary.operations.trends.overall.status, 'string');
  assert.equal(typeof summary.operations.trends.byOperation.read_dtc.status, 'string');
  assert.equal(typeof summary.operations.trends.overall.reason, 'string');
  assert.equal(typeof summary.operations.trends.byOperation.read_dtc.reason, 'string');
  assert.equal(typeof summary.operations.trends.overall.confidence, 'number');
  assert.equal(typeof summary.operations.trends.byOperation.read_dtc.confidence, 'number');
  assert.ok(summary.operations.trends.overall.confidence >= 0);
  assert.ok(summary.operations.trends.overall.confidence <= 1);
  assert.ok(summary.operations.trends.byOperation.read_dtc.confidence >= 0);
  assert.ok(summary.operations.trends.byOperation.read_dtc.confidence <= 1);

  const newest = summary.operations.daily[0]!;
  assert.equal(newest.date, '2024-04-02');
  assert.equal(newest.total, 1);
  assert.equal(newest.success, 1);
  assert.equal(newest.failure, 0);
  assert.equal(newest.successRate, 1);
  assert.equal(newest.failureRate, 0);
  assert.equal(newest.byOperation.status.success, 1);
  assert.equal(newest.byOperation.status.total, 1);

  const older = summary.operations.daily.find((entry) => entry.date === '2024-04-01');
  assert.ok(older);
  assert.equal(older.total, 2);
  assert.equal(older.success, 1);
  assert.equal(older.failure, 1);
  assert.equal(older.successRate, 0.5);
  assert.equal(older.failureRate, 0.5);
  assert.equal(older.byOperation.read_dtc.success, 1);
  assert.equal(older.byOperation.live_data.failure, 1);
  assert.equal(older.byOperation.live_data.total, 1);
});
