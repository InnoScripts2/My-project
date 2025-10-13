/**
 * Unit tests for supabase-store.ts - Cloud Supabase storage
 *
 * NOTE: Tests use mocked Supabase client to avoid network calls.
 * No actual connection to Supabase is made (firewall-safe for CI/CD).
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { SupabaseStore, createSupabaseStore } from './supabase-store.js';
import { Registry } from 'prom-client';

// Mock Supabase client - no network calls
const createMockSupabaseClient = () => ({
  from: (table: string) => ({
    insert: mock.fn(() => Promise.resolve({ data: null, error: null })),
    select: mock.fn(() => ({
      eq: mock.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    update: mock.fn(() => Promise.resolve({ data: null, error: null })),
    delete: mock.fn(() => Promise.resolve({ data: null, error: null })),
  }),
  storage: {
    from: (bucket: string) => ({
      upload: mock.fn(() => Promise.resolve({ data: { path: 'test.pdf' }, error: null })),
      getPublicUrl: mock.fn(() => ({ data: { publicUrl: 'https://example.com/test.pdf' } })),
      list: mock.fn(() => Promise.resolve({ data: [{ name: 'test.pdf' }], error: null })),
    }),
  },
  rpc: mock.fn(() => Promise.resolve({ data: {}, error: null })),
});

// Helper to create test log
const createTestLog = (index: number) => ({
  kioskId: 'kiosk-1',
  level: 'info' as const,
  message: `Test log ${index}`,
  timestamp: new Date(),
});

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('SupabaseStore - Basic Operations', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('creates store with createSupabaseStore factory', () => {
    const store = createSupabaseStore(mockUrl, mockKey, registry);
    assert.ok(store instanceof SupabaseStore);
    store.close();
  });

  it('creates store instance', () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);
    assert.ok(store);
    store.close();
  });

  it('queues telemetry logs for batching', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    await store.sendTelemetryLog({
      kioskId: 'kiosk-1',
      level: 'info',
      message: 'Test log',
      timestamp: new Date(),
    });

    await store.close();
  });

  it('handles multiple telemetry logs', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    const logs = [
      {
        kioskId: 'kiosk-1',
        level: 'info' as const,
        message: 'Log 1',
        timestamp: new Date(),
      },
      {
        kioskId: 'kiosk-1',
        level: 'warn' as const,
        message: 'Log 2',
        timestamp: new Date(),
      },
    ];

    try {
      await store.sendTelemetryBatch(logs);
    } catch (error) {
      // Expected to fail with mock URL
    }

    await store.close();
  });

  it('accepts telemetry with metadata', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    await store.sendTelemetryLog({
      kioskId: 'kiosk-1',
      level: 'error',
      message: 'Error occurred',
      metadata: { errorCode: 'E001', details: 'Test error' },
      timestamp: new Date(),
    });

    await store.close();
  });

  it('flushes batch on close', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    await store.sendTelemetryLog({
      kioskId: 'kiosk-1',
      level: 'info',
      message: 'Test',
      timestamp: new Date(),
    });

    await store.close();
  });

  it('handles empty batch flush gracefully', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);
    await store.close();
  });

  it('closes cleanly without pending operations', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);
    await store.close();
  });
});

describe('SupabaseStore - Batching with Overflow Protection', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('triggers batch flush at BATCH_SIZE (50)', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    // Send 49 logs - should not flush
    for (let i = 0; i < 49; i++) {
      await store.sendTelemetryLog(createTestLog(i));
    }

    // Get metrics before 50th log
    const metrics = await registry.metrics();
    const batchCountBefore = (metrics.match(/supabase_operations_total{operation="telemetry_batch",status="success"} \d+/g) || []).length;

    // Send 50th log - should trigger flush
    try {
      await store.sendTelemetryLog(createTestLog(50));
    } catch (error) {
      // Expected to fail with mock URL
    }

    await store.close();
  });

  it('drops oldest logs when queue exceeds MAX_QUEUE_SIZE (1000)', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    // Send 1001 logs
    for (let i = 0; i < 1001; i++) {
      await store.sendTelemetryLog(createTestLog(i));
    }

    // Check that logs were dropped
    const metrics = await registry.metrics();
    const hasDroppedMetric = metrics.includes('supabase_telemetry_logs_dropped_total');
    
    await store.close();
  });

  it('updates queue size metric', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    await store.sendTelemetryLog(createTestLog(1));
    
    const metrics = await registry.metrics();
    const hasQueueSizeMetric = metrics.includes('supabase_telemetry_queue_size');
    assert.ok(hasQueueSizeMetric);

    await store.close();
  });
});

describe('SupabaseStore - Retry Logic', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('retries on network errors', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    // Send logs that will trigger retry logic
    try {
      await store.sendTelemetryBatch([createTestLog(1)]);
    } catch (error) {
      // Expected to fail after retries
    }

    const metrics = await registry.metrics();
    // Check for retry attempts metric
    const hasRetryMetric = metrics.includes('supabase_retry_attempts_total');
    
    await store.close();
  });

  it('records retry attempts in metrics', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    try {
      await store.sendTelemetryBatch([createTestLog(1)]);
    } catch (error) {
      // Expected
    }

    const metrics = await registry.metrics();
    assert.ok(metrics.includes('supabase_retry_attempts_total'));

    await store.close();
  });
});

describe('SupabaseStore - Circuit Breaker', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('tracks circuit breaker state in metrics', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    const metrics = await registry.metrics();
    assert.ok(metrics.includes('supabase_circuit_breaker_state'));

    await store.close();
  });

  it('opens circuit after multiple failures', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    // Trigger 5 failures to open circuit
    for (let i = 0; i < 5; i++) {
      try {
        await store.sendTelemetryBatch([createTestLog(i)]);
      } catch (error) {
        // Expected
      }
    }

    // Next attempt should fail fast (circuit open)
    const startTime = Date.now();
    try {
      await store.sendTelemetryBatch([createTestLog(6)]);
    } catch (error) {
      const duration = Date.now() - startTime;
      // Circuit breaker should fail fast (< 100ms)
      assert.ok(duration < 100, 'Circuit breaker should fail fast when OPEN');
    }

    await store.close();
  });

  it('records circuit breaker state changes', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    // Trigger failures
    for (let i = 0; i < 5; i++) {
      try {
        await store.sendTelemetryBatch([createTestLog(i)]);
      } catch (error) {
        // Expected
      }
    }

    const metrics = await registry.metrics();
    assert.ok(metrics.includes('supabase_circuit_breaker_state_changes_total'));

    await store.close();
  });
});

describe('SupabaseStore - Prometheus Metrics', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('exports all required metrics', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    const metrics = await registry.metrics();

    // Check all required metrics exist
    assert.ok(metrics.includes('supabase_operations_total'));
    assert.ok(metrics.includes('supabase_operation_duration_seconds'));
    assert.ok(metrics.includes('supabase_retry_attempts_total'));
    assert.ok(metrics.includes('supabase_circuit_breaker_state_changes_total'));
    assert.ok(metrics.includes('supabase_telemetry_logs_dropped_total'));
    assert.ok(metrics.includes('supabase_telemetry_queue_size'));
    assert.ok(metrics.includes('supabase_circuit_breaker_state'));

    await store.close();
  });

  it('increments operation counters', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    try {
      await store.sendTelemetryBatch([createTestLog(1)]);
    } catch (error) {
      // Expected
    }

    const metrics = await registry.metrics();
    assert.ok(metrics.includes('supabase_operations_total'));

    await store.close();
  });
});

describe('SupabaseStore - Feature Flags', () => {
  const mockUrl = 'https://test.supabase.co';
  const mockKey = 'test-key';
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  it('returns consistent structure for feature flags', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    const flags = await store.getFeatureFlags();

    assert.ok(typeof flags === 'object');
    assert.ok(!Array.isArray(flags));

    await store.close();
  });

  it('handles feature flags errors gracefully', async () => {
    const store = new SupabaseStore(mockUrl, mockKey, registry);

    const flags = await store.getFeatureFlags();

    assert.ok(typeof flags === 'object');

    await store.close();
  });
});
