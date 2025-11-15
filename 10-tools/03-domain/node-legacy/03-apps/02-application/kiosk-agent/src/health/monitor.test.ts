/**
 * Tests for health monitor
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HealthMonitor } from './monitor.js';
import * as path from 'path';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  const testDbPath = path.join('/tmp', `health-test-${Date.now()}.db`);

  before(() => {
    monitor = new HealthMonitor(60);
  });

  after(() => {
    monitor.stopMonitoring();
  });

  describe('checkLive', () => {
    it('должен вернуть pass для живого процесса', () => {
      const health = monitor.checkLive();
      
      assert.strictEqual(health.status, 'pass');
      assert.ok(health.timestamp);
      assert.ok(health.uptime >= 0);
      assert.ok(health.checks);
      assert.ok(health.checks.process);
      assert.strictEqual(health.checks.process.status, 'pass');
    });

    it('должен включать event loop lag', () => {
      const health = monitor.checkLive();
      
      assert.ok(typeof health.eventLoopLag === 'number');
      assert.ok(health.eventLoopLag >= 0);
    });
  });

  // Note: checkReady, checkStartup, checkDeep tests require PersistenceStore
  // which SqliteStore doesn't fully implement yet. These will be tested
  // in integration tests once the store types are aligned.
});
